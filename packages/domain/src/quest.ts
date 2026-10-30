import { DomainError } from './errors.ts'
import type { EvidenceKind } from './evidence.ts'

export const QUEST_TYPES = ['main', 'side', 'daily', 'hidden', 'breakthrough'] as const
export type QuestType = (typeof QUEST_TYPES)[number]

/** Who authored the quest. An agent-authored quest waits in PROPOSED until the Host reviews it. */
export type QuestSource = 'host' | 'agent' | 'system'

export type QuestStatus =
  | 'PROPOSED' | 'AVAILABLE' | 'ACCEPTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'VERIFYING'
  | 'NEEDS_EVIDENCE' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'

/** The state machine from docs/05-domain-model.md. PROPOSED → CANCELLED is the Host declining a proposal. */
const TRANSITIONS: Readonly<Record<QuestStatus, readonly QuestStatus[]>> = {
  PROPOSED: ['AVAILABLE', 'CANCELLED'],
  AVAILABLE: ['ACCEPTED', 'CANCELLED', 'EXPIRED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED', 'EXPIRED'],
  IN_PROGRESS: ['SUBMITTED', 'CANCELLED', 'EXPIRED'],
  SUBMITTED: ['VERIFYING'],
  VERIFYING: ['COMPLETED', 'NEEDS_EVIDENCE', 'REJECTED'],
  NEEDS_EVIDENCE: ['SUBMITTED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
}

export function isTerminal(status: QuestStatus): boolean {
  return TRANSITIONS[status].length === 0
}

/** One deterministic acceptance condition: at least `minCount` qualifying pieces of evidence of `kind`. */
export interface EvidenceCriterion {
  readonly kind: EvidenceKind
  readonly minCount: number
  readonly description: string
}

/** Versioned reward rule; the version is part of the settlement idempotency key. */
export interface RewardRule {
  readonly ruleVersion: string
  readonly xp: number
}

export interface Quest {
  readonly id: string
  readonly hostId: string
  readonly type: QuestType
  readonly source: QuestSource
  readonly title: string
  readonly objective: string
  /** Why the quest was suggested; required from an agent so the Host can judge where it came from. */
  readonly rationale: string
  readonly criteria: readonly EvidenceCriterion[]
  readonly reward: RewardRule
  readonly status: QuestStatus
  /** Optimistic-concurrency counter; bumps on every transition. */
  readonly revision: number
  readonly proposedAt: string
  readonly acceptedAt: string | null
  readonly closedAt: string | null
  readonly evidenceIds: readonly string[]
  /** After this instant an unstarted or in-progress quest expires; null means open-ended. */
  readonly expiresAt: string | null
  /** Free-form growth track tag (e.g. "测试工程"); aggregates completions, never claims proficiency. */
  readonly skill: string
  /** Dedupe key for System-generated quests; the same opportunity is proposed at most once. */
  readonly sourceKey: string | null
}

/**
 * Where an expired deadline leads. Quests the Host already submitted evidence
 * for (SUBMITTED, VERIFYING, NEEDS_EVIDENCE) are never failed by the clock.
 */
export function expiryTarget(quest: Quest, now: string): QuestStatus | null {
  if (quest.expiresAt === null || Date.parse(quest.expiresAt) > Date.parse(now)) return null
  if (quest.status === 'PROPOSED') return 'CANCELLED'
  if (quest.status === 'AVAILABLE' || quest.status === 'ACCEPTED' || quest.status === 'IN_PROGRESS') return 'EXPIRED'
  return null
}

export interface QuestTransition {
  readonly questId: string
  readonly from: QuestStatus
  readonly to: QuestStatus
  readonly at: string
}

export const MAX_XP_PER_QUEST = 1000

export function proposeQuest(input: {
  id: string
  hostId: string
  type: QuestType
  source: QuestSource
  title: string
  objective: string
  rationale?: string
  criteria: readonly EvidenceCriterion[]
  reward: RewardRule
  at: string
  expiresAt?: string | null
  skill?: string
  sourceKey?: string | null
}): Quest {
  const title = input.title.trim()
  if (title.length === 0) throw new DomainError('quest/invalid', 'quest needs a title')
  const rationale = (input.rationale ?? '').trim()
  if (input.source === 'agent' && rationale.length === 0) {
    throw new DomainError('quest/invalid', 'an agent-proposed quest must explain why it is suggested')
  }
  if (input.criteria.length === 0) {
    throw new DomainError('quest/invalid', 'quest needs at least one acceptance criterion')
  }
  for (const criterion of input.criteria) {
    if (!Number.isInteger(criterion.minCount) || criterion.minCount < 1) {
      throw new DomainError('quest/invalid', 'criterion minCount must be a positive integer')
    }
  }
  if (!Number.isInteger(input.reward.xp) || input.reward.xp < 0 || input.reward.xp > MAX_XP_PER_QUEST) {
    throw new DomainError('quest/invalid', `reward xp must be an integer from 0 to ${MAX_XP_PER_QUEST}`)
  }
  return {
    id: input.id,
    hostId: input.hostId,
    type: input.type,
    source: input.source,
    title,
    objective: input.objective.trim(),
    rationale,
    criteria: input.criteria,
    reward: input.reward,
    status: 'PROPOSED',
    revision: 0,
    proposedAt: input.at,
    acceptedAt: null,
    closedAt: null,
    evidenceIds: [],
    expiresAt: input.expiresAt ?? null,
    skill: (input.skill ?? '').trim(),
    sourceKey: input.sourceKey ?? null,
  }
}

/**
 * Move a quest along one legal edge. Every caller goes through here so an
 * illegal jump (for example straight to COMPLETED) is impossible to persist.
 */
export function transition(quest: Quest, to: QuestStatus, at: string): { quest: Quest, transition: QuestTransition } {
  if (!TRANSITIONS[quest.status].includes(to)) {
    throw new DomainError('quest/illegal-transition', `quest ${quest.id} cannot move ${quest.status} → ${to}`)
  }
  const next: Quest = {
    ...quest,
    status: to,
    revision: quest.revision + 1,
    acceptedAt: to === 'ACCEPTED' ? at : quest.acceptedAt,
    closedAt: isTerminal(to) ? at : quest.closedAt,
  }
  return { quest: next, transition: { questId: quest.id, from: quest.status, to, at } }
}

/** Attach evidence ids without a status change; the caller transitions to SUBMITTED separately. */
export function attachEvidence(quest: Quest, evidenceIds: readonly string[]): Quest {
  const merged = [...quest.evidenceIds]
  for (const id of evidenceIds) if (!merged.includes(id)) merged.push(id)
  return { ...quest, evidenceIds: merged }
}
