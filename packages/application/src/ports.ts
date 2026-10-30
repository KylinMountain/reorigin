import type { Evidence, Host, LedgerEntry, Quest, Verification } from '@reorigin/domain'

/** Append-only audit record; every stored event also gets an outbox row for async consumers. */
export interface StoredEvent {
  readonly eventId: string
  readonly type: EventType
  readonly aggregateId: string
  readonly occurredAt: string
  readonly causationId: string
  readonly correlationId: string
  readonly schemaVersion: 1
  readonly payload: unknown
}

export type EventType =
  | 'host.bound.v1'
  | 'quest.proposed.v1'
  | 'quest.transitioned.v1'
  | 'quest.accepted.v1'
  | 'quest.evidence_submitted.v1'
  | 'quest.verified.v1'
  | 'quest.completed.v1'
  | 'reward.granted.v1'

export interface StoredVerification extends Verification {
  readonly id: string
  readonly verifiedAt: string
}

/**
 * Everything one command may read or write. A Store runs the callback inside a
 * single transaction: either every write lands or none does.
 */
export interface Transaction {
  getHost(): Host | undefined
  insertHost(host: Host): void

  getQuest(questId: string): Quest | undefined
  listQuests(hostId: string): Quest[]
  insertQuest(quest: Quest): void
  /** Write `quest` only if the stored revision is still `expectedRevision`; otherwise throw `store/conflict`. */
  updateQuest(quest: Quest, expectedRevision: number): void

  insertEvidence(evidence: Evidence): void
  getEvidence(evidenceIds: readonly string[]): Evidence[]
  /** Content hashes that passed verification for any quest of `hostId` other than `exceptQuestId`. */
  countedEvidenceHashes(hostId: string, exceptQuestId: string): Set<string>

  insertVerification(verification: StoredVerification): void
  latestVerification(questId: string): StoredVerification | undefined

  /** Insert unless the idempotency key already exists; returns the stored entry either way. */
  insertLedgerEntry(entry: LedgerEntry): { entry: LedgerEntry, inserted: boolean }
  totalXp(hostId: string): number
  listLedger(hostId: string, limit: number): LedgerEntry[]

  appendEvent(event: StoredEvent): void

  getCommandResult(commandId: string): unknown
  saveCommandResult(commandId: string, commandType: string, result: unknown, at: string): void
}

export interface Store {
  transaction<T>(work: (tx: Transaction) => T): T
}

export interface Clock {
  now(): string
}

export interface IdSource {
  next(prefix: string): string
}
