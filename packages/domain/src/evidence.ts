import { DomainError } from './errors.ts'

/**
 * How a piece of evidence reached the system. P1 only accepts what the Host
 * submits by hand; connector-sourced kinds (GitHub, calendar) arrive in P3.
 */
export const EVIDENCE_KINDS = ['manual', 'link', 'git_commit'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

export interface Evidence {
  readonly id: string
  readonly hostId: string
  readonly kind: EvidenceKind
  /** Locator of the source: a URL, a commit SHA, or free text for manual evidence. */
  readonly ref: string
  readonly summary: string
  /** When the action happened in the real world, as claimed by the source. */
  readonly observedAt: string
  /** When the system received the evidence; never earlier than `observedAt`. */
  readonly recordedAt: string
  /** Hash over kind + ref + summary; the reuse check keys on it. */
  readonly contentHash: string
  /** The Host confirmed this manual claim is true. Required for `manual` evidence to count. */
  readonly attested: boolean
}

export function recordEvidence(input: Evidence): Evidence {
  if (input.ref.trim().length === 0) throw new DomainError('evidence/invalid', 'evidence needs a ref')
  if (Date.parse(input.observedAt) > Date.parse(input.recordedAt)) {
    throw new DomainError('evidence/invalid', 'evidence cannot be observed after it was recorded')
  }
  return { ...input, ref: input.ref.trim(), summary: input.summary.trim() }
}
