import type { Consent, Evidence, Host, LedgerEntry, Preferences, Quest, Verification, WorldEvent } from '@reorigin/domain'

/** A System message in the panel feed; one per source key. */
export interface Notice {
  readonly id: string
  readonly hostId: string
  readonly kind: 'level_up' | 'reward' | 'proposal' | 'expired' | 'nudge'
  readonly title: string
  readonly body: string
  readonly createdAt: string
  readonly readAt: string | null
  readonly sourceKey: string
}

/** Long-term memory the agent may read: milestones derived from completed quests, and Host-written notes. */
export interface Memory {
  readonly id: string
  readonly hostId: string
  readonly kind: 'milestone' | 'note'
  readonly text: string
  readonly sourceRef: string | null
  readonly createdAt: string
  readonly forgottenAt: string | null
}

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
  | 'consent.granted.v1'
  | 'consent.revoked.v1'
  | 'world.event_observed.v1'
  | 'preferences.updated.v1'
  | 'memory.added.v1'
  | 'memory.forgotten.v1'
  | 'system.nudged.v1'

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
  /** Outbox rows not yet dispatched, oldest first. */
  pendingOutbox(limit: number): StoredEvent[]
  markDispatched(eventId: string, at: string): void

  findQuestBySourceKey(hostId: string, sourceKey: string): Quest | undefined
  countSystemProposalsSince(hostId: string, since: string): number

  getPreferences(hostId: string): Preferences
  setPreferences(hostId: string, preferences: Preferences): void

  insertConsent(consent: Consent): void
  getConsent(consentId: string): Consent | undefined
  listConsents(hostId: string): Consent[]
  updateConsent(consent: Consent): void

  /** Insert unless (consent, externalId) exists; returns whether it was new. */
  insertWorldEvent(event: WorldEvent): boolean
  /** Events of active consents observed at or after `since`. */
  listWorldEvents(hostId: string, since: string): WorldEvent[]
  /** A collected commit of an active consent whose SHA starts with `shaPrefix` (≥ 7 hex chars). */
  findCommit(hostId: string, shaPrefix: string): WorldEvent | undefined
  deleteWorldEvents(consentId: string): number

  /** Insert unless the source key exists; returns whether it was new. */
  insertNotice(notice: Notice): boolean
  listNotices(hostId: string, limit: number): Notice[]
  markNoticesRead(hostId: string, at: string): void

  insertMemory(memory: Memory): boolean
  listMemories(hostId: string, limit: number): Memory[]
  forgetMemory(hostId: string, memoryId: string, at: string): boolean

  getCommandResult(commandId: string): unknown
  saveCommandResult(commandId: string, commandType: string, result: unknown, at: string): void
}

export interface Store {
  transaction<T>(work: (tx: Transaction) => T): T
}

/** Time source, including the Host's local calendar (quiet hours and daily caps are local). */
export interface Clock {
  now(): string
  /** Local hour 0–23 of an ISO instant. */
  localHour(iso: string): number
  /** Local calendar day (YYYY-MM-DD) of an ISO instant. */
  localDay(iso: string): string
  /** ISO instant of the start of the local day containing `iso`. */
  localDayStart(iso: string): string
}

export interface IdSource {
  next(prefix: string): string
}
