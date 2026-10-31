import type { EvidenceCriterion, QuestStatus, VerificationReason } from '@reorigin/domain'
import type { ReviewNote, Transaction } from './ports.ts'

/** Notes are advisory comments, so keep them short enough to read at a glance. */
export const MAX_REVIEW_NOTE = 500

/**
 * What an agent may read about a quest the Host opened for review: the
 * criteria, the evidence as submitted, and the deterministic verdict. Quests
 * the Host has not opened never appear, so evidence stays out of prompts by
 * default (the brief excludes it too).
 */
export interface ReviewableSubmission {
  readonly questId: string
  readonly title: string
  readonly objective: string
  readonly status: QuestStatus
  readonly criteria: readonly EvidenceCriterion[]
  readonly evidence: readonly { kind: string, ref: string, summary: string, observedAt: string, corroborated: boolean, attested: boolean }[]
  readonly verdict: string | null
  readonly reasons: readonly VerificationReason[]
  readonly notes: readonly string[]
}

export function reviewableSubmissions(tx: Transaction, hostId: string): ReviewableSubmission[] {
  const allowed = tx.reviewableQuestIds(hostId)
  const notes = tx.listReviewNotes(hostId)
  return tx.listQuests(hostId).filter(quest => allowed.has(quest.id)).map((quest) => {
    const verification = tx.latestVerification(quest.id)
    return {
      questId: quest.id,
      title: quest.title,
      objective: quest.objective,
      status: quest.status,
      criteria: quest.criteria,
      evidence: tx.getEvidence(quest.evidenceIds).map(item => ({
        kind: item.kind, ref: item.ref, summary: item.summary, observedAt: item.observedAt,
        corroborated: item.corroboratedBy !== null, attested: item.attested,
      })),
      verdict: verification?.verdict ?? null,
      reasons: verification?.reasons ?? [],
      notes: notes.filter(note => note.questId === quest.id).map(note => note.note),
    }
  })
}

export function notesByQuest(notes: readonly ReviewNote[]): Map<string, ReviewNote[]> {
  const grouped = new Map<string, ReviewNote[]>()
  for (const note of notes) grouped.set(note.questId, [...grouped.get(note.questId) ?? [], note])
  return grouped
}
