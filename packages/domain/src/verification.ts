import type { Evidence, EvidenceKind } from './evidence.ts'
import type { Quest } from './quest.ts'

/**
 * Bump when the rules below change; stored with every verdict.
 * v2: evidence counts only when corroborated by an authorized source or attested by the Host.
 */
export const VERIFIER_RULE_VERSION = 'deterministic-v2'

export type Verdict = 'pass' | 'needs_evidence' | 'reject'

/** Why an item was excluded or a criterion failed. Structured so each surface words it in its own language. */
export type VerificationReason =
  | { readonly code: 'other_host' | 'before_acceptance' | 'reused' | 'unattested', readonly evidenceId: string }
  | { readonly code: 'criterion_unmet', readonly description: string, readonly kind: EvidenceKind, readonly count: number, readonly required: number }

export interface Verification {
  readonly questId: string
  readonly verdict: Verdict
  readonly ruleVersion: string
  /** Evidence that counted towards the criteria. */
  readonly acceptedEvidenceIds: readonly string[]
  /** One reason per excluded item or unmet criterion. */
  readonly reasons: readonly VerificationReason[]
}

/**
 * Deterministic verifier (docs/05: rules outrank model opinion). A model may
 * later add commentary, but it never feeds this verdict.
 *
 * @param usedElsewhere - content hashes already counted by another completed quest of this Host.
 */
export function verifyQuest(quest: Quest, evidence: readonly Evidence[], usedElsewhere: ReadonlySet<string>): Verification {
  const reasons: VerificationReason[] = []
  const accepted: Evidence[] = []
  let forged = false
  const acceptedAt = quest.acceptedAt === null ? Number.NaN : Date.parse(quest.acceptedAt)

  for (const item of evidence) {
    if (item.hostId !== quest.hostId) {
      forged = true
      reasons.push({ code: 'other_host', evidenceId: item.id })
    } else if (!(Date.parse(item.observedAt) >= acceptedAt)) {
      reasons.push({ code: 'before_acceptance', evidenceId: item.id })
    } else if (usedElsewhere.has(item.contentHash)) {
      reasons.push({ code: 'reused', evidenceId: item.id })
    } else if (item.corroboratedBy === null && !item.attested) {
      reasons.push({ code: 'unattested', evidenceId: item.id })
    } else {
      accepted.push(item)
    }
  }

  let satisfied = true
  for (const criterion of quest.criteria) {
    const count = accepted.filter(item => item.kind === criterion.kind).length
    if (count < criterion.minCount) {
      satisfied = false
      reasons.push({ code: 'criterion_unmet', description: criterion.description, kind: criterion.kind, count, required: criterion.minCount })
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
