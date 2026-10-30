import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { ApplicationError, type StoredEvent, type StoredVerification, type Store, type Transaction } from '@reorigin/application'
import type { Evidence, Host, LedgerEntry, Quest } from '@reorigin/domain'
import { migrate } from './migrations.ts'

type Row = Record<string, SQLInputValue>

/**
 * SQLite (WAL) implementation of the Application Store (ADR-004). Every
 * command runs in one `BEGIN IMMEDIATE` transaction so a crash leaves either
 * the whole command or none of it.
 */
export class SqliteStore implements Store {
  private readonly db: DatabaseSync
  private readonly tx: Transaction

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    migrate(this.db)
    this.tx = createTransaction(this.db)
  }

  transaction<T>(work: (tx: Transaction) => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = work(this.tx)
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    this.db.close()
  }
}

function createTransaction(db: DatabaseSync): Transaction {
  const one = (sql: string, ...params: SQLInputValue[]): Row | undefined => db.prepare(sql).get(...params) as Row | undefined
  const all = (sql: string, ...params: SQLInputValue[]): Row[] => db.prepare(sql).all(...params) as Row[]
  const run = (sql: string, ...params: SQLInputValue[]): number => Number(db.prepare(sql).run(...params).changes)

  return {
    getHost() {
      const row = one('SELECT * FROM hosts LIMIT 1')
      return row === undefined ? undefined : toHost(row)
    },
    insertHost(host) {
      run('INSERT INTO hosts (id, display_name, goals_json, bound_at) VALUES (?, ?, ?, ?)',
        host.id, host.displayName, JSON.stringify(host.goals), host.boundAt)
    },

    getQuest(questId) {
      const row = one('SELECT * FROM quests WHERE id = ?', questId)
      return row === undefined ? undefined : toQuest(row)
    },
    listQuests(hostId) {
      return all('SELECT * FROM quests WHERE host_id = ? ORDER BY proposed_at DESC, id DESC', hostId).map(toQuest)
    },
    insertQuest(quest) {
      run(`INSERT INTO quests (id, host_id, type, source, title, objective, criteria_json, reward_rule_version, reward_xp,
             status, revision, proposed_at, accepted_at, closed_at, evidence_ids_json, rationale)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...questColumns(quest))
    },
    updateQuest(quest, expectedRevision) {
      const changed = run(`UPDATE quests SET status = ?, revision = ?, accepted_at = ?, closed_at = ?, evidence_ids_json = ?
                           WHERE id = ? AND revision = ?`,
      quest.status, quest.revision, quest.acceptedAt, quest.closedAt, JSON.stringify(quest.evidenceIds), quest.id, expectedRevision)
      if (changed !== 1) throw new ApplicationError('store/conflict', `quest ${quest.id} changed concurrently`)
    },

    insertEvidence(evidence) {
      run(`INSERT INTO evidence (id, host_id, kind, ref, summary, observed_at, recorded_at, content_hash, attested)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      evidence.id, evidence.hostId, evidence.kind, evidence.ref, evidence.summary, evidence.observedAt,
      evidence.recordedAt, evidence.contentHash, evidence.attested ? 1 : 0)
    },
    getEvidence(evidenceIds) {
      if (evidenceIds.length === 0) return []
      return all(`SELECT * FROM evidence WHERE id IN (${evidenceIds.map(() => '?').join(', ')}) ORDER BY recorded_at, id`, ...evidenceIds).map(toEvidence)
    },
    countedEvidenceHashes(hostId, exceptQuestId) {
      const rows = all(`SELECT e.content_hash AS hash FROM verifications v
                          JOIN json_each(v.accepted_evidence_ids_json) j
                          JOIN evidence e ON e.id = j.value
                        WHERE v.verdict = 'pass' AND e.host_id = ? AND v.quest_id <> ?`, hostId, exceptQuestId)
      return new Set(rows.map(row => String(row.hash)))
    },

    insertVerification(verification) {
      run(`INSERT INTO verifications (id, quest_id, verdict, rule_version, accepted_evidence_ids_json, reasons_json, verified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
      verification.id, verification.questId, verification.verdict, verification.ruleVersion,
      JSON.stringify(verification.acceptedEvidenceIds), JSON.stringify(verification.reasons), verification.verifiedAt)
    },
    latestVerification(questId) {
      const row = one('SELECT * FROM verifications WHERE quest_id = ? ORDER BY verified_at DESC, rowid DESC LIMIT 1', questId)
      return row === undefined ? undefined : toVerification(row)
    },

    insertLedgerEntry(entry) {
      const inserted = run(`INSERT INTO reward_ledger (id, host_id, quest_id, reward_type, amount, rule_version, idempotency_key, granted_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (idempotency_key) DO NOTHING`,
      entry.id, entry.hostId, entry.questId, entry.rewardType, entry.amount, entry.ruleVersion, entry.idempotencyKey, entry.grantedAt) === 1
      const stored = one('SELECT * FROM reward_ledger WHERE idempotency_key = ?', entry.idempotencyKey)
      return { entry: toLedgerEntry(stored!), inserted }
    },
    totalXp(hostId) {
      return Number(one(`SELECT COALESCE(SUM(amount), 0) AS xp FROM reward_ledger WHERE host_id = ? AND reward_type = 'xp'`, hostId)!.xp)
    },
    listLedger(hostId, limit) {
      return all('SELECT * FROM reward_ledger WHERE host_id = ? ORDER BY granted_at DESC, rowid DESC LIMIT ?', hostId, limit).map(toLedgerEntry)
    },

    appendEvent(event: StoredEvent) {
      run(`INSERT INTO events (event_id, type, aggregate_id, occurred_at, causation_id, correlation_id, schema_version, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      event.eventId, event.type, event.aggregateId, event.occurredAt, event.causationId, event.correlationId,
      event.schemaVersion, JSON.stringify(event.payload))
      run('INSERT INTO outbox (event_id) VALUES (?)', event.eventId)
    },

    getCommandResult(commandId) {
      const row = one('SELECT result_json FROM processed_commands WHERE command_id = ?', commandId)
      return row === undefined ? undefined : JSON.parse(String(row.result_json))
    },
    saveCommandResult(commandId, commandType, result, at) {
      run('INSERT INTO processed_commands (command_id, command_type, result_json, processed_at) VALUES (?, ?, ?, ?)',
        commandId, commandType, JSON.stringify(result), at)
    },
  }
}

function questColumns(quest: Quest): SQLInputValue[] {
  return [quest.id, quest.hostId, quest.type, quest.source, quest.title, quest.objective, JSON.stringify(quest.criteria),
    quest.reward.ruleVersion, quest.reward.xp, quest.status, quest.revision, quest.proposedAt, quest.acceptedAt,
    quest.closedAt, JSON.stringify(quest.evidenceIds), quest.rationale]
}

const text = (value: SQLInputValue | undefined): string => String(value)
const nullableText = (value: SQLInputValue | undefined): string | null => value === null || value === undefined ? null : String(value)

function toHost(row: Row): Host {
  return { id: text(row.id), displayName: text(row.display_name), goals: JSON.parse(text(row.goals_json)), boundAt: text(row.bound_at) }
}

function toQuest(row: Row): Quest {
  return {
    id: text(row.id),
    hostId: text(row.host_id),
    type: text(row.type) as Quest['type'],
    source: text(row.source) as Quest['source'],
    title: text(row.title),
    objective: text(row.objective),
    rationale: text(row.rationale),
    criteria: JSON.parse(text(row.criteria_json)),
    reward: { ruleVersion: text(row.reward_rule_version), xp: Number(row.reward_xp) },
    status: text(row.status) as Quest['status'],
    revision: Number(row.revision),
    proposedAt: text(row.proposed_at),
    acceptedAt: nullableText(row.accepted_at),
    closedAt: nullableText(row.closed_at),
    evidenceIds: JSON.parse(text(row.evidence_ids_json)),
  }
}

function toEvidence(row: Row): Evidence {
  return {
    id: text(row.id),
    hostId: text(row.host_id),
    kind: text(row.kind) as Evidence['kind'],
    ref: text(row.ref),
    summary: text(row.summary),
    observedAt: text(row.observed_at),
    recordedAt: text(row.recorded_at),
    contentHash: text(row.content_hash),
    attested: Number(row.attested) === 1,
  }
}

function toVerification(row: Row): StoredVerification {
  return {
    id: text(row.id),
    questId: text(row.quest_id),
    verdict: text(row.verdict) as StoredVerification['verdict'],
    ruleVersion: text(row.rule_version),
    acceptedEvidenceIds: JSON.parse(text(row.accepted_evidence_ids_json)),
    reasons: JSON.parse(text(row.reasons_json)),
    verifiedAt: text(row.verified_at),
  }
}

function toLedgerEntry(row: Row): LedgerEntry {
  return {
    id: text(row.id),
    hostId: text(row.host_id),
    questId: text(row.quest_id),
    rewardType: 'xp',
    amount: Number(row.amount),
    ruleVersion: text(row.rule_version),
    idempotencyKey: text(row.idempotency_key),
    grantedAt: text(row.granted_at),
  }
}
