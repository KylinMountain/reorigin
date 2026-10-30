import { createHash } from 'node:crypto'
import {
  attachEvidence,
  bindHost,
  levelForXp,
  proposeQuest,
  recordEvidence,
  settleQuest,
  transition,
  verifyQuest,
  type Evidence,
  type Host,
  type LedgerEntry,
  type LevelProgress,
  type Quest,
  type QuestStatus,
} from '@reorigin/domain'
import { ALLOWED_ACTORS, commandSchema, type Command } from './commands.ts'
import { ApplicationError, toFailure, type Result } from './errors.ts'
import type { Clock, EventType, IdSource, Store, StoredVerification, Transaction } from './ports.ts'

/** Bump with any change to how XP is computed for a quest. */
export const REWARD_RULE_VERSION = 'xp-v1'

export interface QuestView extends Quest {
  readonly lastVerification: StoredVerification | null
  readonly settled: boolean
}

export interface Dashboard {
  readonly host: Host | null
  readonly progress: LevelProgress
  readonly quests: readonly QuestView[]
  readonly ledger: readonly LedgerEntry[]
}

/** What one command returns on success; the same value is replayed for a repeated `commandId`. */
export type CommandOutcome =
  | { readonly type: 'BindHost', readonly host: Host }
  | { readonly type: 'ProposeQuest' | 'AcceptQuest' | 'CancelQuest' | 'SubmitQuestEvidence', readonly quest: Quest }
  | { readonly type: 'VerifyQuest', readonly quest: Quest, readonly verification: StoredVerification }
  | { readonly type: 'SettleQuest', readonly entry: LedgerEntry, readonly granted: boolean }

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
      if (host === null) return { host, progress: levelForXp(0), quests: [], ledger: [] }
      const ledger = tx.listLedger(host.id, 20)
      const settledQuests = new Set(ledger.map(entry => entry.questId))
      const quests = tx.listQuests(host.id).map(quest => ({
        ...quest,
        lastVerification: tx.latestVerification(quest.id) ?? null,
        settled: settledQuests.has(quest.id),
      }))
      return { host, progress: levelForXp(tx.totalXp(host.id)), quests, ledger }
    })
  }

  private handle(tx: Transaction, command: Command): CommandOutcome {
    const at = this.clock.now()
    const emit = (type: EventType, aggregateId: string, payload: unknown): void => {
      tx.appendEvent({
        eventId: this.ids.next('evt'),
        type,
        aggregateId,
        occurredAt: at,
        causationId: command.commandId,
        correlationId: command.commandId,
        schemaVersion: 1,
        payload,
      })
    }

    if (command.type === 'BindHost') {
      if (tx.getHost() !== undefined) throw new ApplicationError('host/already-bound', 'a host is already bound')
      const host = bindHost({ id: this.ids.next('host'), displayName: command.payload.displayName, goals: command.payload.goals, at })
      tx.insertHost(host)
      emit('host.bound.v1', host.id, { displayName: host.displayName })
      return { type: 'BindHost', host }
    }

    const host = tx.getHost()
    if (host === undefined) throw new ApplicationError('host/not-bound', 'bind a host first')
    if (host.id !== command.hostId) throw new ApplicationError('command/forbidden', 'command targets another host')

    // Move a quest one edge and persist it with optimistic concurrency.
    const move = (quest: Quest, to: QuestStatus): Quest => {
      const { quest: next, transition: edge } = transition(quest, to, at)
      tx.updateQuest(next, quest.revision)
      emit('quest.transitioned.v1', quest.id, edge)
      return next
    }

    if (command.type === 'ProposeQuest') {
      const { payload } = command
      let quest = proposeQuest({
        id: this.ids.next('quest'),
        hostId: host.id,
        type: payload.type,
        source: command.actor,
        title: payload.title,
        objective: payload.objective,
        criteria: payload.criteria,
        reward: { ruleVersion: REWARD_RULE_VERSION, xp: payload.xp },
        at,
      })
      tx.insertQuest(quest)
      emit('quest.proposed.v1', quest.id, { source: quest.source, title: quest.title })
      // A quest the Host wrote for themself needs no review; an agent's waits in PROPOSED.
      if (command.actor === 'host') quest = move(quest, 'AVAILABLE')
      return { type: 'ProposeQuest', quest }
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
      case 'SubmitQuestEvidence': {
        let current = quest.status === 'ACCEPTED' ? move(quest, 'IN_PROGRESS') : quest
        const evidence: Evidence[] = command.payload.evidence.map(item => recordEvidence({
          id: this.ids.next('ev'),
          hostId: host.id,
          kind: item.kind,
          ref: item.ref,
          summary: item.summary,
          observedAt: new Date(item.observedAt).toISOString(),
          recordedAt: at,
          contentHash: contentHash(item.kind, item.ref, item.summary),
          attested: item.attested,
        }))
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
        const { entry, inserted } = tx.insertLedgerEntry(settleQuest(quest, { id: this.ids.next('rwd'), at }))
        if (inserted) emit('reward.granted.v1', quest.id, { amount: entry.amount, idempotencyKey: entry.idempotencyKey })
        return { type: 'SettleQuest', entry, granted: inserted }
      }
    }
  }
}

function contentHash(kind: string, ref: string, summary: string): string {
  return `sha256:${createHash('sha256').update(`${kind}\n${ref.trim()}\n${summary.trim()}`).digest('hex')}`
}
