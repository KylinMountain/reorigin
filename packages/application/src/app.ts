import { createHash } from 'node:crypto'
import {
  ACHIEVEMENT_RULE_VERSION,
  CONFIDENCE_LABEL,
  PERSONA_STYLE_INFO,
  assessSkill,
  attachEvidence,
  bindHost,
  chapterFor,
  detectOpportunities,
  evaluateAchievements,
  expiryTarget,
  filterCommit,
  inQuietHours,
  isTerminal,
  levelForXp,
  proposeQuest,
  recordEvidence,
  reverseSettlement,
  sameReading,
  settleQuest,
  tierLabel,
  transition,
  verifyQuest,
  type Achievement,
  type AchievementFacts,
  type Chapter,
  type Consent,
  type Correction,
  type Evidence,
  type Host,
  type LedgerEntry,
  type LevelProgress,
  type Preferences,
  type Quest,
  type QuestStatus,
  type SkillAssessment,
  type SkillBasis,
  type SkillRecord,
  type WorldEvent,
} from '@reorigin/domain'
import { AGENT_MAX_PENDING_PROPOSALS, AGENT_MAX_XP, ALLOWED_ACTORS, commandSchema, type Command } from './commands.ts'
import { ApplicationError, toFailure, type Result } from './errors.ts'
import type { Clock, EventType, IdSource, Memory, Notice, Store, StoredEvent, StoredVerification, Transaction } from './ports.ts'

/** Bump with any change to how XP is computed for a quest. */
export const REWARD_RULE_VERSION = 'xp-v1'

const DAY = 86_400_000

export interface QuestView extends Quest {
  readonly lastVerification: StoredVerification | null
  readonly settled: boolean
  /** Present when the Host took this completion back. */
  readonly retraction: Correction | null
}

/** An unlock and whether today's facts still support it (a retraction can withdraw the basis). */
export interface AchievementView extends Achievement {
  readonly active: boolean
}

/** Completed quests grouped by their growth-track tag. A count of verified completions; the assessment lives in `skills`. */
export interface GrowthTrack {
  readonly skill: string
  readonly completions: number
  readonly xp: number
  readonly lastCompletedAt: string
}

export interface Dashboard {
  readonly host: Host | null
  readonly progress: LevelProgress
  readonly chapter: Chapter
  readonly quests: readonly QuestView[]
  readonly ledger: readonly LedgerEntry[]
  readonly notices: readonly Notice[]
  readonly unreadNotices: number
  readonly memories: readonly Memory[]
  readonly growth: readonly GrowthTrack[]
  /** Latest evidence-based assessment per growth tag. */
  readonly skills: readonly SkillAssessment[]
  /** Badges and titles in the order they were unlocked. */
  readonly achievements: readonly AchievementView[]
  /** The title the Host chose to display, while it is still supported. */
  readonly title: AchievementView | null
  /** Recent audit events, newest first: what changed, when, and on whose command. */
  readonly audit: readonly StoredEvent[]
  readonly consents: readonly Consent[]
  readonly preferences: Preferences | null
  /** Recently collected commits, offered as corroborated evidence. */
  readonly recentCommits: readonly WorldEvent[]
}

export type AgentBrief =
  | { readonly bound: false }
  | {
    readonly bound: true
    readonly displayName: string
    readonly goals: readonly string[]
    readonly progress: LevelProgress
    readonly chapter: string
    readonly title: string | null
    readonly persona: { readonly name: string, readonly voice: string }
    readonly skills: readonly { skill: string, tier: string, confidence: string, quests: number }[]
    readonly openQuests: readonly { title: string, type: Quest['type'], status: QuestStatus, source: Quest['source'] }[]
    readonly recentlyCompleted: readonly string[]
    readonly memories: readonly string[]
    readonly pendingAgentProposals: number
    readonly limits: { readonly maxXp: number, readonly maxPendingProposals: number }
  }

/** What one command returns on success; the same value is replayed for a repeated `commandId`. */
export type CommandOutcome =
  | { readonly type: 'BindHost' | 'EquipTitle', readonly host: Host }
  | { readonly type: 'ProposeQuest' | 'AcceptQuest' | 'CancelQuest' | 'PauseQuest' | 'ResumeQuest' | 'SubmitQuestEvidence', readonly quest: Quest }
  | { readonly type: 'DeleteHost', readonly removedRows: number }
  | { readonly type: 'VerifyQuest', readonly quest: Quest, readonly verification: StoredVerification }
  | { readonly type: 'SettleQuest', readonly entry: LedgerEntry, readonly granted: boolean }
  | { readonly type: 'RetractCompletion', readonly correction: Correction }
  | { readonly type: 'GrantConsent' | 'RevokeConsent', readonly consent: Consent, readonly deletedEvents?: number }
  | { readonly type: 'UpdatePreferences', readonly preferences: Preferences }
  | { readonly type: 'AddMemory', readonly memory: Memory }
  | { readonly type: 'ForgetMemory' | 'MarkNoticesRead', readonly done: true }

/** Everything the System holds about the Host, as one JSON document they can keep. */
export interface DataExport {
  readonly format: 'reorigin-export'
  readonly formatVersion: 1
  readonly exportedAt: string
  readonly tables: Record<string, unknown[]>
}

export interface TickReport {
  readonly expired: number
  readonly proposed: number
  readonly nudged: number
  readonly assessed: number
  readonly unlocked: number
  readonly dispatched: number
}

/**
 * The Application layer: the only way state changes. Each command runs in one
 * transaction that writes the new state, its audit events, outbox rows, and
 * the command's own result for idempotent replay.
 */
export class ReOriginApp {
  private readonly store: Store
  private readonly clock: Clock
  private readonly ids: IdSource

  constructor(deps: { store: Store, clock: Clock, ids: IdSource }) {
    this.store = deps.store
    this.clock = deps.clock
    this.ids = deps.ids
  }

  execute(input: unknown): Result<CommandOutcome> {
    const parsed = commandSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: { code: 'command/invalid', message: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') } }
    }
    const command = parsed.data
    if (!ALLOWED_ACTORS[command.type].includes(command.actor)) {
      return { ok: false, error: { code: 'command/forbidden', message: `${command.actor} may not issue ${command.type}` } }
    }
    try {
      return this.store.transaction(tx => {
        const replay = tx.getCommandResult(command.commandId)
        if (replay !== undefined) return { ok: true, value: replay as CommandOutcome }
        // A deadline that passed must apply before the command acts on the quest.
        this.expireDue(tx, this.clock.now(), 'system:expiry')
        const outcome = this.handle(tx, command)
        tx.saveCommandResult(command.commandId, command.type, outcome, this.clock.now())
        return { ok: true, value: outcome }
      })
    } catch (error) {
      return toFailure(error)
    }
  }

  dashboard(): Dashboard {
    return this.store.transaction(tx => {
      const host = tx.getHost() ?? null
      if (host === null) {
        return {
          host, progress: levelForXp(0), chapter: chapterFor(1), quests: [], ledger: [], notices: [], unreadNotices: 0,
          memories: [], growth: [], skills: [], achievements: [], title: null, audit: [], consents: [], preferences: null, recentCommits: [],
        }
      }
      const ledger = tx.listLedger(host.id, 50)
      const questXp = tx.questXp(host.id)
      const corrections = new Map(tx.listCorrections(host.id).map(correction => [correction.questId, correction]))
      const allQuests = tx.listQuests(host.id)
      const quests = allQuests.map(quest => ({
        ...quest,
        lastVerification: tx.latestVerification(quest.id) ?? null,
        settled: questXp.has(quest.id),
        retraction: corrections.get(quest.id) ?? null,
      }))
      const progress = levelForXp(tx.totalXp(host.id))
      const notices = tx.listNotices(host.id, 20)
      const growth = this.growthState(tx, host)
      const achievements = tx.listAchievements(host.id).map(item => ({ ...item, active: growth.supported.has(item.key) }))
      return {
        host,
        progress,
        chapter: chapterFor(progress.level),
        quests,
        ledger,
        notices,
        unreadNotices: notices.filter(notice => notice.readAt === null).length,
        memories: tx.listMemories(host.id, 30),
        growth: growthTracks(allQuests.filter(quest => !corrections.has(quest.id)), questXp),
        skills: growth.skills,
        achievements,
        title: achievements.find(item => item.kind === 'title' && item.key === host.titleKey && item.active) ?? null,
        audit: tx.listEvents(40),
        consents: tx.listConsents(host.id),
        preferences: tx.getPreferences(host.id),
        recentCommits: tx.listWorldEvents(host.id, new Date(Date.parse(this.clock.now()) - 14 * DAY).toISOString()).slice(0, 20),
      }
    })
  }

  /** The Host's own records, for them to take away (docs/01 principle 6). */
  exportData(): DataExport {
    return this.store.transaction(tx => ({ format: 'reorigin-export', formatVersion: 1, exportedAt: this.clock.now(), tables: tx.exportAll() }))
  }

  /**
   * What the agent is told each step: goals, progress, open quests, memories,
   * and the proposal budget. Deliberately excludes evidence refs and collected
   * commit content, which are the Host's records, not prompt material.
   */
  agentBrief(): AgentBrief {
    return this.store.transaction(tx => {
      const host = tx.getHost()
      if (host === undefined) return { bound: false }
      const quests = tx.listQuests(host.id)
      const retracted = new Set(tx.listCorrections(host.id).map(correction => correction.questId))
      const open = quests.filter(quest => !isTerminal(quest.status))
      const progress = levelForXp(tx.totalXp(host.id))
      return {
        bound: true,
        displayName: host.displayName,
        goals: host.goals,
        progress,
        chapter: chapterFor(progress.level).title,
        persona: PERSONA_STYLE_INFO[tx.getPreferences(host.id).persona],
        title: host.titleKey === null ? null : tx.listAchievements(host.id).find(item => item.key === host.titleKey)?.name ?? null,
        skills: this.growthState(tx, host).skills.map(item => ({
          skill: item.skill, tier: tierLabel(item.tier), confidence: CONFIDENCE_LABEL[item.confidence], quests: item.basis.quests,
        })),
        openQuests: open.map(quest => ({ title: quest.title, type: quest.type, status: quest.status, source: quest.source })),
        recentlyCompleted: quests.filter(quest => quest.status === 'COMPLETED' && !retracted.has(quest.id)).slice(0, 5).map(quest => quest.title),
        memories: tx.listMemories(host.id, 8).map(memory => memory.text),
        pendingAgentProposals: open.filter(quest => quest.source === 'agent' && quest.status === 'PROPOSED').length,
        limits: { maxXp: AGENT_MAX_XP, maxPendingProposals: AGENT_MAX_PENDING_PROPOSALS },
      }
    })
  }

  /**
   * The model-facing tool's only door. The actor is fixed to `agent`, and the
   * command id derives from the tool call id, so a retried call proposes once.
   */
  proposeFromAgent(callId: string, payload: unknown): Result<CommandOutcome> {
    const hostId = this.store.transaction(tx => tx.getHost()?.id)
    if (hostId === undefined) return { ok: false, error: { code: 'host/not-bound', message: 'no host is bound yet' } }
    return this.execute({
      commandId: `agent:${digest(callId).slice(0, 40)}`,
      actor: 'agent',
      issuedAt: this.clock.now(),
      schemaVersion: 1,
      type: 'ProposeQuest',
      hostId,
      payload,
    })
  }

  /**
   * Store commits a collector read under an active consent. Raw input passes
   * the privacy filter first; already-seen commits are ignored.
   */
  ingestCommits(consentId: string, commits: readonly { sha: string, committedAt: string, subject: string, filesChanged: number }[]): Result<{ added: number }> {
    try {
      return this.store.transaction(tx => {
        const consent = tx.getConsent(consentId)
        if (consent === undefined || consent.status !== 'active') {
          throw new ApplicationError('consent/inactive', `consent ${consentId} is not active`)
        }
        let added = 0
        for (const commit of commits) {
          const filtered = filterCommit(commit)
          const event: WorldEvent = { id: this.ids.next('wev'), hostId: consent.hostId, consentId, source: consent.source, ...filtered }
          if (tx.insertWorldEvent(event)) added += 1
        }
        if (added > 0) this.emit(tx, 'world.event_observed.v1', consentId, { added }, 'system:collector')
        return { ok: true, value: { added } }
      })
    } catch (error) {
      return toFailure(error)
    }
  }

  /** Active consents a collector should read; the collector never decides scope itself. */
  activeConsents(): Consent[] {
    return this.store.transaction(tx => {
      const host = tx.getHost()
      return host === undefined ? [] : tx.listConsents(host.id).filter(consent => consent.status === 'active')
    })
  }

  /**
   * The System's heartbeat: expire overdue quests, run world rules within the
   * Host's quiet hours and daily cap, then dispatch the outbox into notices and
   * memories. Safe to run as often as wanted; every product is keyed.
   */
  tick(): TickReport {
    return this.store.transaction(tx => {
      const now = this.clock.now()
      const expired = this.expireDue(tx, now, 'system:tick')
      const host = tx.getHost()
      let proposed = 0
      let nudged = 0
      let growth = { assessed: 0, unlocked: 0 }
      if (host !== undefined) {
        const preferences = tx.getPreferences(host.id)
        if (!inQuietHours(this.clock.localHour(now), preferences)) {
          const { proposals, nudges } = detectOpportunities({
            now,
            events: tx.listWorldEvents(host.id, new Date(Date.parse(now) - 7 * DAY).toISOString()),
            hasGoals: host.goals.length > 0 && tx.listConsents(host.id).some(consent => consent.status === 'active'),
            localDay: iso => this.clock.localDay(iso),
          })
          const dayStart = this.clock.localDayStart(now)
          let budget = preferences.systemProposalsPerDay - tx.countSystemProposalsSince(host.id, dayStart)
          for (const candidate of proposals) {
            if (budget <= 0) break
            if (tx.findQuestBySourceKey(host.id, candidate.sourceKey) !== undefined) continue
            const quest = proposeQuest({
              id: this.ids.next('quest'),
              hostId: host.id,
              type: 'hidden',
              source: 'system',
              title: candidate.title,
              objective: candidate.objective,
              rationale: candidate.rationale,
              criteria: [{ kind: 'git_commit', minCount: candidate.minCommits, description: `${candidate.minCommits} 次已授权仓库中的提交` }],
              reward: { ruleVersion: REWARD_RULE_VERSION, xp: candidate.xp },
              at: now,
              expiresAt: new Date(Date.parse(now) + candidate.expiresInDays * DAY).toISOString(),
              skill: '节奏',
              sourceKey: candidate.sourceKey,
            })
            tx.insertQuest(quest)
            this.emit(tx, 'quest.proposed.v1', quest.id, { source: quest.source, title: quest.title, sourceKey: candidate.sourceKey }, 'system:tick')
            proposed += 1
            budget -= 1
          }
          for (const nudge of nudges) {
            const notice: Notice = { id: this.ids.next('ntc'), hostId: host.id, kind: 'nudge', title: nudge.title, body: nudge.body, createdAt: now, readAt: null, sourceKey: nudge.sourceKey }
            if (tx.insertNotice(notice)) {
              this.emit(tx, 'system.nudged.v1', host.id, { sourceKey: nudge.sourceKey }, 'system:tick')
              nudged += 1
            }
          }
        }
        // Growth answers the Host's own settlements, so quiet hours do not hold it back.
        growth = this.advanceGrowth(tx, host, now)
      }
      return { expired, proposed, nudged, ...growth, dispatched: this.dispatchOutbox(tx, now) }
    })
  }

  private emit(tx: Transaction, type: EventType, aggregateId: string, payload: unknown, causationId: string): void {
    tx.appendEvent({
      eventId: this.ids.next('evt'),
      type,
      aggregateId,
      occurredAt: this.clock.now(),
      causationId,
      correlationId: causationId,
      schemaVersion: 1,
      payload,
    })
  }

  private move(tx: Transaction, quest: Quest, to: QuestStatus, causationId: string): Quest {
    const { quest: next, transition: edge } = transition(quest, to, this.clock.now())
    tx.updateQuest(next, quest.revision)
    this.emit(tx, 'quest.transitioned.v1', quest.id, edge, causationId)
    return next
  }

  private expireDue(tx: Transaction, now: string, causationId: string): number {
    const host = tx.getHost()
    if (host === undefined) return 0
    let count = 0
    for (const quest of tx.listQuests(host.id)) {
      const target = expiryTarget(quest, now)
      if (target === null) continue
      this.move(tx, quest, target, causationId)
      count += 1
    }
    return count
  }

  /**
   * Growth Engine and achievements. Re-read every growth tag from verified
   * completions, store the readings that changed, then grant whatever the
   * catalog now allows. Both are keyed, so running it again is a no-op.
   */
  private advanceGrowth(tx: Transaction, host: Host, now: string): { assessed: number, unlocked: number } {
    const localDay = (iso: string): string => this.clock.localDay(iso)
    const records = this.completedRecords(tx, host)
    const latest = new Map(tx.latestAssessments(host.id).map(item => [item.skill, item]))
    const bySkill = groupBySkill(records)
    let assessed = 0
    for (const [skill, list] of bySkill) {
      const reading = assessSkill(skill, list, localDay)
      const previous = latest.get(skill)
      if (reading === null || sameReading(previous, reading)) continue
      const assessment: SkillAssessment = { ...reading, id: this.ids.next('ska'), hostId: host.id, assessedAt: now }
      tx.insertAssessment(assessment)
      latest.set(skill, assessment)
      this.emit(tx, 'skill.assessed.v1', assessment.id, {
        skill, tier: assessment.tier, confidence: assessment.confidence, basis: assessment.basis,
        previousTier: previous?.tier ?? null, previousConfidence: previous?.confidence ?? null,
      }, 'system:growth')
      assessed += 1
    }

    const unlocks = evaluateAchievements(this.achievementFacts(tx, host, records, [...latest.values()].filter(item => bySkill.has(item.skill))))
    const held = new Set(tx.listAchievements(host.id).map(item => item.key))
    let unlocked = 0
    for (const unlock of unlocks) {
      if (held.has(unlock.key)) continue
      const achievement: Achievement = { ...unlock, id: this.ids.next('ach'), hostId: host.id, ruleVersion: ACHIEVEMENT_RULE_VERSION, grantedAt: now }
      if (!tx.insertAchievement(achievement)) continue
      this.emit(tx, 'achievement.unlocked.v1', achievement.id, { key: unlock.key, kind: unlock.kind, name: unlock.name, description: unlock.description }, 'system:growth')
      unlocked += 1
    }
    return { assessed, unlocked }
  }

  /** Verified completions the Host has not retracted, oldest first, with the evidence each one counted. */
  private completedRecords(tx: Transaction, host: Host): (SkillRecord & { skill: string })[] {
    const retracted = new Set(tx.listCorrections(host.id).map(correction => correction.questId))
    return tx.listQuests(host.id)
      .filter(quest => quest.status === 'COMPLETED' && !retracted.has(quest.id))
      .map(quest => {
        const verification = tx.latestVerification(quest.id)
        const evidence = verification?.verdict === 'pass' ? tx.getEvidence(verification.acceptedEvidenceIds) : []
        return {
          questId: quest.id,
          type: quest.type,
          skill: quest.skill,
          completedAt: quest.closedAt ?? quest.proposedAt,
          evidence: evidence.map(item => ({ id: item.id, corroborated: item.corroboratedBy !== null })),
        }
      })
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
  }

  private achievementFacts(tx: Transaction, host: Host, records: readonly SkillRecord[], skills: readonly SkillAssessment[]): AchievementFacts {
    return {
      completed: records.map(record => ({
        questId: record.questId, type: record.type, completedAt: record.completedAt,
        corroborated: record.evidence.length > 0 && record.evidence.every(item => item.corroborated),
      })),
      level: levelForXp(tx.totalXp(host.id)).level,
      skills: skills.map(item => ({ skill: item.skill, tier: item.tier })),
      localDay: iso => this.clock.localDay(iso),
    }
  }

  /**
   * Current assessments (skills that still have unretracted completions) and
   * the achievement keys today's facts support. Unlocks are permanent records;
   * whether one still holds is derived, never stored.
   */
  private growthState(tx: Transaction, host: Host): { skills: SkillAssessment[], supported: Set<string> } {
    const records = this.completedRecords(tx, host)
    const bySkill = groupBySkill(records)
    const skills = tx.latestAssessments(host.id).filter(item => bySkill.has(item.skill))
    return { skills, supported: new Set(evaluateAchievements(this.achievementFacts(tx, host, records, skills)).map(unlock => unlock.key)) }
  }

  /** Outbox consumer: turn audit events into Host-facing notices and milestone memories. Keyed, so redelivery is harmless. */
  private dispatchOutbox(tx: Transaction, now: string): number {
    const pending = tx.pendingOutbox(200)
    const host = tx.getHost()
    for (const event of pending) {
      if (host !== undefined) this.consume(tx, host, event, now)
      tx.markDispatched(event.eventId, now)
    }
    return pending.length
  }

  private consume(tx: Transaction, host: Host, event: StoredEvent, now: string): void {
    const notice = (kind: Notice['kind'], title: string, body: string, sourceKey: string): void => {
      tx.insertNotice({ id: this.ids.next('ntc'), hostId: host.id, kind, title, body, createdAt: now, readAt: null, sourceKey })
    }
    const payload = event.payload as Record<string, unknown>
    switch (event.type) {
      case 'reward.granted.v1': {
        const amount = Number(payload.amount)
        const before = levelForXp(Number(payload.xpAfter) - amount).level
        const after = levelForXp(Number(payload.xpAfter))
        notice('reward', `【结算】+${amount} XP`, `「${tx.getQuest(event.aggregateId)?.title ?? '任务'}」的奖励已入账。`, `reward:${event.eventId}`)
        if (after.level > before) {
          const chapter = chapterFor(after.level)
          notice('level_up', `【升级】Lv.${after.level}`, `第 ${chapter.index} 章「${chapter.title}」：${chapter.epigraph}`, `level:${after.level}`)
        }
        return
      }
      case 'quest.completed.v1': {
        const quest = tx.getQuest(event.aggregateId)
        // Retracted before this event was delivered: there is no milestone to remember.
        const retracted = tx.listCorrections(host.id).some(correction => correction.questId === event.aggregateId)
        if (quest !== undefined && !retracted) {
          tx.insertMemory({ id: this.ids.next('mem'), hostId: host.id, kind: 'milestone', text: `完成了「${quest.title}」${quest.skill === '' ? '' : `（${quest.skill}）`}`, sourceRef: quest.id, createdAt: now, forgottenAt: null })
        }
        return
      }
      case 'quest.proposed.v1': {
        if (payload.source === 'host') return
        const title = String(payload.title)
        notice('proposal', payload.source === 'system' ? '【隐藏任务出现】' : '【Agent 提议】', `「${title}」等待你审阅。`, `proposal:${event.aggregateId}`)
        return
      }
      case 'skill.assessed.v1': {
        // A larger basis with the same tier and confidence is recorded, but not worth a message.
        if (payload.tier === payload.previousTier && payload.confidence === payload.previousConfidence) return
        const basis = payload.basis as SkillBasis
        const tier = tierLabel(payload.tier as SkillAssessment['tier'])
        notice('skill', `【技能评估】${String(payload.skill)} · ${tier}`,
          `置信度${CONFIDENCE_LABEL[payload.confidence as SkillAssessment['confidence']]}。依据：${basis.quests} 个经核验任务、${basis.activeDays} 个活跃日、跨度 ${basis.spanDays} 天；`
          + `${basis.corroborated}/${basis.evidence} 份证据由授权来源佐证。只反映系统内的记录，不代表系统外的能力。`,
          `skill:${event.aggregateId}`)
        return
      }
      case 'achievement.unlocked.v1':
        notice('achievement', payload.kind === 'title' ? `【称号获得】${String(payload.name)}` : `【成就解锁】${String(payload.name)}`,
          `${String(payload.description)}。`, `achievement:${String(payload.key)}`)
        return
      case 'quest.retracted.v1': {
        const reversed = Number(payload.xpReversed)
        notice('correction', '【纠错】已撤回完成', `「${String(payload.title)}」不再计入成长${reversed > 0 ? `，扣回 ${reversed} XP` : ''}。理由：${String(payload.reason)}`, `retracted:${event.aggregateId}`)
        return
      }
      case 'quest.transitioned.v1':
        if (payload.to === 'EXPIRED') notice('expired', '【任务过期】', `「${tx.getQuest(event.aggregateId)?.title ?? '任务'}」已超过期限。`, `expired:${event.aggregateId}`)
        return
      default:
    }
  }

  private handle(tx: Transaction, command: Command): CommandOutcome {
    const at = this.clock.now()
    const emit = (type: EventType, aggregateId: string, payload: unknown): void => this.emit(tx, type, aggregateId, payload, command.commandId)
    const move = (quest: Quest, to: QuestStatus): Quest => this.move(tx, quest, to, command.commandId)

    if (command.type === 'BindHost') {
      if (tx.getHost() !== undefined) throw new ApplicationError('host/already-bound', 'a host is already bound')
      const host = bindHost({ id: this.ids.next('host'), displayName: command.payload.displayName, goals: command.payload.goals, at })
      tx.insertHost(host)
      if (command.payload.persona !== undefined) tx.setPreferences(host.id, { ...tx.getPreferences(host.id), persona: command.payload.persona })
      emit('host.bound.v1', host.id, { displayName: host.displayName, persona: tx.getPreferences(host.id).persona })
      return { type: 'BindHost', host }
    }

    const host = tx.getHost()
    if (host === undefined) throw new ApplicationError('host/not-bound', 'bind a host first')
    if (host.id !== command.hostId) throw new ApplicationError('command/forbidden', 'command targets another host')

    switch (command.type) {
      case 'ProposeQuest': {
        const { payload } = command
        if (command.actor === 'agent') {
          if (payload.xp > AGENT_MAX_XP) {
            throw new ApplicationError('policy/agent-limit', `an agent may offer at most ${AGENT_MAX_XP} XP`)
          }
          const pending = tx.listQuests(host.id).filter(quest => quest.source === 'agent' && quest.status === 'PROPOSED').length
          if (pending >= AGENT_MAX_PENDING_PROPOSALS) {
            throw new ApplicationError('policy/agent-limit', `${pending} agent proposals already await review`)
          }
        }
        const days = payload.expiresInDays ?? (payload.type === 'daily' ? 1 : undefined)
        let quest = proposeQuest({
          id: this.ids.next('quest'),
          hostId: host.id,
          type: payload.type,
          source: command.actor,
          title: payload.title,
          objective: payload.objective,
          rationale: payload.rationale,
          criteria: payload.criteria,
          reward: { ruleVersion: REWARD_RULE_VERSION, xp: payload.xp },
          at,
          expiresAt: days === undefined ? null : new Date(Date.parse(at) + days * DAY).toISOString(),
          skill: payload.skill,
        })
        tx.insertQuest(quest)
        emit('quest.proposed.v1', quest.id, { source: quest.source, title: quest.title })
        // A quest the Host wrote for themself needs no review; an agent's waits in PROPOSED.
        if (command.actor === 'host') quest = move(quest, 'AVAILABLE')
        return { type: 'ProposeQuest', quest }
      }
      case 'GrantConsent': {
        const existing = tx.listConsents(host.id).find(consent => consent.status === 'active' && consent.scopeRef === command.payload.scopeRef)
        if (existing !== undefined) throw new ApplicationError('consent/duplicate', 'this repository is already authorized')
        const consent: Consent = {
          id: this.ids.next('cns'), hostId: host.id, source: command.payload.source, scopeRef: command.payload.scopeRef,
          authorEmail: command.payload.authorEmail.toLowerCase(), status: 'active', grantedAt: at, revokedAt: null,
        }
        tx.insertConsent(consent)
        emit('consent.granted.v1', consent.id, { source: consent.source })
        return { type: 'GrantConsent', consent }
      }
      case 'RevokeConsent': {
        const consent = tx.getConsent(command.payload.consentId)
        if (consent === undefined || consent.hostId !== host.id) throw new ApplicationError('consent/not-found', 'no such consent')
        if (consent.status !== 'active') throw new ApplicationError('consent/inactive', 'consent already revoked')
        const revoked: Consent = { ...consent, status: 'revoked', revokedAt: at }
        tx.updateConsent(revoked)
        const deletedEvents = command.payload.deleteData ? tx.deleteWorldEvents(consent.id) : 0
        emit('consent.revoked.v1', consent.id, { deletedEvents })
        return { type: 'RevokeConsent', consent: revoked, deletedEvents }
      }
      case 'UpdatePreferences': {
        const preferences: Preferences = {
          quietHours: command.payload.quietHours,
          systemProposalsPerDay: command.payload.systemProposalsPerDay,
          persona: command.payload.persona ?? tx.getPreferences(host.id).persona,
        }
        tx.setPreferences(host.id, preferences)
        emit('preferences.updated.v1', host.id, preferences)
        return { type: 'UpdatePreferences', preferences }
      }
      case 'AddMemory': {
        const memory: Memory = { id: this.ids.next('mem'), hostId: host.id, kind: 'note', text: command.payload.text.trim(), sourceRef: null, createdAt: at, forgottenAt: null }
        tx.insertMemory(memory)
        emit('memory.added.v1', memory.id, { kind: memory.kind })
        return { type: 'AddMemory', memory }
      }
      case 'ForgetMemory': {
        if (!tx.forgetMemory(host.id, command.payload.memoryId, at)) throw new ApplicationError('memory/not-found', 'no such memory')
        emit('memory.forgotten.v1', command.payload.memoryId, {})
        return { type: 'ForgetMemory', done: true }
      }
      case 'MarkNoticesRead':
        tx.markNoticesRead(host.id, at)
        return { type: 'MarkNoticesRead', done: true }
      case 'DeleteHost': {
        if (command.payload.confirmName.trim() !== host.displayName) {
          throw new ApplicationError('host/confirmation-mismatch', 'type the display name exactly to confirm deletion')
        }
        // No audit event survives this: the audit trail is the Host's data too.
        return { type: 'DeleteHost', removedRows: tx.purgeAll() }
      }
      case 'EquipTitle': {
        const { titleKey } = command.payload
        if (titleKey !== null && !(tx.listAchievements(host.id).some(item => item.kind === 'title' && item.key === titleKey) && this.growthState(tx, host).supported.has(titleKey))) {
          throw new ApplicationError('title/locked', `title ${titleKey} is not unlocked`)
        }
        tx.setHostTitle(host.id, titleKey)
        emit('host.title_equipped.v1', host.id, { titleKey })
        return { type: 'EquipTitle', host: { ...host, titleKey } }
      }
      default:
    }

    const quest = tx.getQuest(command.payload.questId)
    if (quest === undefined || quest.hostId !== host.id) {
      throw new ApplicationError('quest/not-found', `no quest ${command.payload.questId}`)
    }

    switch (command.type) {
      case 'AcceptQuest': {
        // Accepting a proposal is the Host's review of it.
        const available = quest.status === 'PROPOSED' ? move(quest, 'AVAILABLE') : quest
        const accepted = move(available, 'ACCEPTED')
        emit('quest.accepted.v1', quest.id, {})
        return { type: 'AcceptQuest', quest: accepted }
      }
      case 'CancelQuest':
        return { type: 'CancelQuest', quest: move(quest, 'CANCELLED') }
      case 'PauseQuest': {
        const paused = move(quest, 'PAUSED')
        emit('quest.paused.v1', quest.id, {})
        return { type: 'PauseQuest', quest: paused }
      }
      case 'ResumeQuest': {
        // ACCEPTED → IN_PROGRESS is a legal edge too; resuming is only for what was paused.
        if (quest.status !== 'PAUSED') throw new ApplicationError('quest/illegal-transition', `quest ${quest.id} is ${quest.status}, not PAUSED`)
        const resumed = move(quest, 'IN_PROGRESS')
        emit('quest.resumed.v1', quest.id, { expiresAt: resumed.expiresAt })
        return { type: 'ResumeQuest', quest: resumed }
      }
      case 'SubmitQuestEvidence': {
        let current = quest.status === 'ACCEPTED' ? move(quest, 'IN_PROGRESS') : quest
        const evidence: Evidence[] = command.payload.evidence.map(item => {
          // A commit the collector saw under an active consent speaks for itself: its SHA
          // and time come from the repository, not from what the Host typed.
          const commit = item.kind === 'git_commit' && /^[0-9a-f]{7,64}$/i.test(item.ref.trim())
            ? tx.findCommit(host.id, item.ref.trim().toLowerCase())
            : undefined
          const ref = commit?.externalId ?? item.ref
          return recordEvidence({
            id: this.ids.next('ev'),
            hostId: host.id,
            kind: item.kind,
            ref,
            summary: commit?.summary ?? item.summary,
            observedAt: commit?.observedAt ?? new Date(item.observedAt).toISOString(),
            recordedAt: at,
            contentHash: contentHash(item.kind, ref, commit === undefined ? item.summary : ''),
            attested: item.attested,
            corroboratedBy: commit?.id ?? null,
          })
        })
        for (const item of evidence) tx.insertEvidence(item)
        current = attachEvidence(current, evidence.map(item => item.id))
        current = move(current, 'SUBMITTED')
        emit('quest.evidence_submitted.v1', quest.id, { evidenceIds: evidence.map(item => item.id) })
        return { type: 'SubmitQuestEvidence', quest: current }
      }
      case 'VerifyQuest': {
        const verifying = move(quest, 'VERIFYING')
        const verdict = verifyQuest(verifying, tx.getEvidence(verifying.evidenceIds), tx.countedEvidenceHashes(host.id, quest.id))
        const verification: StoredVerification = { ...verdict, id: this.ids.next('ver'), verifiedAt: at }
        tx.insertVerification(verification)
        emit('quest.verified.v1', quest.id, { verdict: verification.verdict, ruleVersion: verification.ruleVersion })
        const next = move(verifying, verdict.verdict === 'pass' ? 'COMPLETED' : verdict.verdict === 'reject' ? 'REJECTED' : 'NEEDS_EVIDENCE')
        if (next.status === 'COMPLETED') emit('quest.completed.v1', quest.id, { verificationId: verification.id })
        return { type: 'VerifyQuest', quest: next, verification }
      }
      case 'SettleQuest': {
        if (tx.listCorrections(host.id).some(correction => correction.questId === quest.id)) {
          throw new ApplicationError('settlement/retracted', `quest ${quest.id} was retracted by the Host`)
        }
        const { entry, inserted } = tx.insertLedgerEntry(settleQuest(quest, { id: this.ids.next('rwd'), at }))
        if (inserted) emit('reward.granted.v1', quest.id, { amount: entry.amount, idempotencyKey: entry.idempotencyKey, xpAfter: tx.totalXp(host.id) })
        return { type: 'SettleQuest', entry, granted: inserted }
      }
      case 'RetractCompletion': {
        if (quest.status !== 'COMPLETED') throw new ApplicationError('correction/not-completed', `quest ${quest.id} is ${quest.status}, not COMPLETED`)
        if (tx.listCorrections(host.id).some(correction => correction.questId === quest.id)) {
          throw new ApplicationError('correction/duplicate', `quest ${quest.id} was already retracted`)
        }
        // Compensate every grant rather than editing it; the reversal key makes a second reversal impossible.
        let xpReversed = 0
        for (const grant of tx.ledgerFor(quest.id).filter(entry => entry.amount > 0)) {
          const { entry, inserted } = tx.insertLedgerEntry(reverseSettlement(grant, { id: this.ids.next('rwd'), at }))
          if (!inserted) continue
          xpReversed += -entry.amount
          emit('reward.reversed.v1', quest.id, { amount: entry.amount, idempotencyKey: entry.idempotencyKey, xpAfter: tx.totalXp(host.id) })
        }
        const correction: Correction = { id: this.ids.next('cor'), hostId: host.id, questId: quest.id, reason: command.payload.reason, xpReversed, correctedAt: at }
        tx.insertCorrection(correction)
        tx.forgetMemoriesFrom(host.id, quest.id, at)
        emit('quest.retracted.v1', quest.id, { reason: correction.reason, xpReversed, title: quest.title })
        return { type: 'RetractCompletion', correction }
      }
    }
  }
}

function groupBySkill(records: readonly (SkillRecord & { skill: string })[]): Map<string, SkillRecord[]> {
  const bySkill = new Map<string, SkillRecord[]>()
  for (const record of records) {
    if (record.skill !== '') bySkill.set(record.skill, [...bySkill.get(record.skill) ?? [], record])
  }
  return bySkill
}

function growthTracks(quests: readonly Quest[], xpByQuest: ReadonlyMap<string, number>): GrowthTrack[] {
  const tracks = new Map<string, { completions: number, xp: number, lastCompletedAt: string }>()
  for (const quest of quests) {
    if (quest.status !== 'COMPLETED') continue
    const skill = quest.skill === '' ? '未分类' : quest.skill
    const track = tracks.get(skill) ?? { completions: 0, xp: 0, lastCompletedAt: '' }
    track.completions += 1
    track.xp += xpByQuest.get(quest.id) ?? 0
    if ((quest.closedAt ?? '') > track.lastCompletedAt) track.lastCompletedAt = quest.closedAt ?? ''
    tracks.set(skill, track)
  }
  return [...tracks.entries()].map(([skill, track]) => ({ skill, ...track })).sort((a, b) => b.completions - a.completions)
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function contentHash(kind: string, ref: string, summary: string): string {
  return `sha256:${digest(`${kind}\n${ref.trim()}\n${summary.trim()}`)}`
}
