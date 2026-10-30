import type { Evidence } from './evidence.ts'
import type { Quest } from './quest.ts'

/** Bump when the rules below change; stored with every verdict. */
export const VERIFIER_RULE_VERSION = 'deterministic-v1'

export type Verdict = 'pass' | 'needs_evidence' | 'reject'

export interface Verification {
  readonly questId: string
  readonly verdict: Verdict
  readonly ruleVersion: string
  /** Evidence that counted towards the criteria. */
  readonly acceptedEvidenceIds: readonly string[]
  /** Human-readable reasons, one per excluded item or unmet criterion. */
  readonly reasons: readonly string[]
}

/**
 * Deterministic verifier (docs/05: rules outrank model opinion). A model may
 * later add commentary, but it never feeds this verdict.
 *
 * @param usedElsewhere - content hashes already counted by another completed quest of this Host.
 */
export function verifyQuest(quest: Quest, evidence: readonly Evidence[], usedElsewhere: ReadonlySet<string>): Verification {
  const reasons: string[] = []
  const accepted: Evidence[] = []
  let forged = false
  const acceptedAt = quest.acceptedAt === null ? Number.NaN : Date.parse(quest.acceptedAt)

  for (const item of evidence) {
    if (item.hostId !== quest.hostId) {
      forged = true
      reasons.push(`${item.id}: belongs to another host`)
    } else if (!(Date.parse(item.observedAt) >= acceptedAt)) {
      reasons.push(`${item.id}: observed before the quest was accepted`)
    } else if (usedElsewhere.has(item.contentHash)) {
      reasons.push(`${item.id}: already counted for another quest`)
    } else if (item.kind === 'manual' && !item.attested) {
      reasons.push(`${item.id}: manual evidence must be attested by the host`)
    } else {
      accepted.push(item)
    }
  }

  let satisfied = true
  for (const criterion of quest.criteria) {
    const count = accepted.filter(item => item.kind === criterion.kind).length
    if (count < criterion.minCount) {
      satisfied = false
      reasons.push(`criterion "${criterion.description}": ${count}/${criterion.minCount} ${criterion.kind}`)
    }
  }

  const verdict: Verdict = forged ? 'reject' : satisfied ? 'pass' : 'needs_evidence'
  return {
    questId: quest.id,
    verdict,
    ruleVersion: VERIFIER_RULE_VERSION,
    acceptedEvidenceIds: verdict === 'pass' ? accepted.map(item => item.id) : [],
    reasons,
  }
}
