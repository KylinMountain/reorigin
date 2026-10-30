import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { ApplicationError, type Memory, type Notice, type StoredEvent, type StoredVerification, type Store, type Transaction } from '@reorigin/application'
import { DEFAULT_PREFERENCES, type Achievement, type Consent, type Evidence, type Host, type LedgerEntry, type Preferences, type Quest, type SkillAssessment, type WorldEvent } from '@reorigin/domain'
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
             status, revision, proposed_at, accepted_at, closed_at, evidence_ids_json, rationale, expires_at, skill, source_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...questColumns(quest))
    },
    updateQuest(quest, expectedRevision) {
      const changed = run(`UPDATE quests SET status = ?, revision = ?, accepted_at = ?, closed_at = ?, evidence_ids_json = ?
                           WHERE id = ? AND revision = ?`,
      quest.status, quest.revision, quest.acceptedAt, quest.closedAt, JSON.stringify(quest.evidenceIds), quest.id, expectedRevision)
      if (changed !== 1) throw new ApplicationError('store/conflict', `quest ${quest.id} changed concurrently`)
    },

    insertEvidence(evidence) {
      run(`INSERT INTO evidence (id, host_id, kind, ref, summary, observed_at, recorded_at, content_hash, attested, corroborated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      evidence.id, evidence.hostId, evidence.kind, evidence.ref, evidence.summary, evidence.observedAt,
      evidence.recordedAt, evidence.contentHash, evidence.attested ? 1 : 0, evidence.corroboratedBy)
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
    pendingOutbox(limit) {
      return all(`SELECT e.* FROM outbox o JOIN events e ON e.event_id = o.event_id
                  WHERE o.dispatched_at IS NULL ORDER BY o.rowid LIMIT ?`, limit).map(toEvent)
    },
    markDispatched(eventId, at) {
      run('UPDATE outbox SET dispatched_at = ? WHERE event_id = ?', at, eventId)
    },

    findQuestBySourceKey(hostId, sourceKey) {
      const row = one('SELECT * FROM quests WHERE host_id = ? AND source_key = ?', hostId, sourceKey)
      return row === undefined ? undefined : toQuest(row)
    },
    countSystemProposalsSince(hostId, since) {
      return Number(one(`SELECT COUNT(*) AS n FROM quests WHERE host_id = ? AND source = 'system' AND proposed_at >= ?`, hostId, since)!.n)
    },

    getPreferences(hostId) {
      const raw = one('SELECT preferences_json FROM hosts WHERE id = ?', hostId)?.preferences_json
      return raw === null || raw === undefined ? DEFAULT_PREFERENCES : { ...DEFAULT_PREFERENCES, ...JSON.parse(String(raw)) as Partial<Preferences> }
    },
    setPreferences(hostId, preferences) {
      run('UPDATE hosts SET preferences_json = ? WHERE id = ?', JSON.stringify(preferences), hostId)
    },

    insertConsent(consent) {
      run(`INSERT INTO consents (id, host_id, source, scope_ref, author_email, status, granted_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      consent.id, consent.hostId, consent.source, consent.scopeRef, consent.authorEmail, consent.status, consent.grantedAt, consent.revokedAt)
    },
    getConsent(consentId) {
      const row = one('SELECT * FROM consents WHERE id = ?', consentId)
      return row === undefined ? undefined : toConsent(row)
    },
    listConsents(hostId) {
      return all('SELECT * FROM consents WHERE host_id = ? ORDER BY granted_at DESC, rowid DESC', hostId).map(toConsent)
    },
    updateConsent(consent) {
      run('UPDATE consents SET status = ?, revoked_at = ? WHERE id = ?', consent.status, consent.revokedAt, consent.id)
    },

    insertWorldEvent(event) {
      return run(`INSERT INTO world_events (id, host_id, consent_id, source, external_id, observed_at, summary, files_changed)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (consent_id, external_id) DO NOTHING`,
      event.id, event.hostId, event.consentId, event.source, event.externalId, event.observedAt, event.summary, event.filesChanged) === 1
    },
    listWorldEvents(hostId, since) {
      return all(`SELECT w.* FROM world_events w JOIN consents c ON c.id = w.consent_id
                  WHERE w.host_id = ? AND c.status = 'active' AND w.observed_at >= ? ORDER BY w.observed_at DESC`, hostId, since).map(toWorldEvent)
    },
    findCommit(hostId, shaPrefix) {
      if (!/^[0-9a-f]{7,64}$/.test(shaPrefix)) return undefined
      const row = one(`SELECT w.* FROM world_events w JOIN consents c ON c.id = w.consent_id
                       WHERE w.host_id = ? AND c.status = 'active' AND w.source = 'git_repo' AND substr(w.external_id, 1, ?) = ?
                       ORDER BY w.observed_at DESC LIMIT 1`, hostId, shaPrefix.length, shaPrefix)
      return row === undefined ? undefined : toWorldEvent(row)
    },
    deleteWorldEvents(consentId) {
      return run('DELETE FROM world_events WHERE consent_id = ?', consentId)
    },

    insertNotice(notice) {
      return run(`INSERT INTO notices (id, host_id, kind, title, body, created_at, read_at, source_key)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (source_key) DO NOTHING`,
      notice.id, notice.hostId, notice.kind, notice.title, notice.body, notice.createdAt, notice.readAt, notice.sourceKey) === 1
    },
    listNotices(hostId, limit) {
      return all('SELECT * FROM notices WHERE host_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', hostId, limit).map(toNotice)
    },
    markNoticesRead(hostId, at) {
      run('UPDATE notices SET read_at = ? WHERE host_id = ? AND read_at IS NULL', at, hostId)
    },

    insertMemory(memory) {
      return run(`INSERT INTO memories (id, host_id, kind, text, source_ref, created_at, forgotten_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      memory.id, memory.hostId, memory.kind, memory.text, memory.sourceRef, memory.createdAt, memory.forgottenAt) === 1
    },
    listMemories(hostId, limit) {
      return all('SELECT * FROM memories WHERE host_id = ? AND forgotten_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT ?', hostId, limit).map(toMemory)
    },
    forgetMemory(hostId, memoryId, at) {
      return run('UPDATE memories SET forgotten_at = ? WHERE id = ? AND host_id = ? AND forgotten_at IS NULL', at, memoryId, hostId) === 1
    },

    setHostTitle(hostId, titleKey) {
      run('UPDATE hosts SET title_key = ? WHERE id = ?', titleKey, hostId)
    },

    insertAssessment(assessment) {
      run(`INSERT INTO skill_assessments (id, host_id, skill, tier, confidence, rule_version, basis_json, quest_ids_json, evidence_ids_json, assessed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assessment.id, assessment.hostId, assessment.skill, assessment.tier, assessment.confidence, assessment.ruleVersion,
      JSON.stringify(assessment.basis), JSON.stringify(assessment.questIds), JSON.stringify(assessment.evidenceIds), assessment.assessedAt)
    },
    latestAssessments(hostId) {
      return all(`SELECT * FROM skill_assessments s
                  WHERE s.host_id = ? AND s.rowid = (SELECT MAX(rowid) FROM skill_assessments t WHERE t.host_id = s.host_id AND t.skill = s.skill)
                  ORDER BY s.tier DESC, s.skill`, hostId).map(toAssessment)
    },

    insertAchievement(achievement) {
      return run(`INSERT INTO achievements (id, host_id, key, kind, name, description, rule_version, cause_ref, granted_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (host_id, key) DO NOTHING`,
      achievement.id, achievement.hostId, achievement.key, achievement.kind, achievement.name, achievement.description,
      achievement.ruleVersion, achievement.causeRef, achievement.grantedAt) === 1
    },
    listAchievements(hostId) {
      return all('SELECT * FROM achievements WHERE host_id = ? ORDER BY granted_at, rowid', hostId).map(toAchievement)
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
    quest.closedAt, JSON.stringify(quest.evidenceIds), quest.rationale, quest.expiresAt, quest.skill, quest.sourceKey]
}

const text = (value: SQLInputValue | undefined): string => String(value)
const nullableText = (value: SQLInputValue | undefined): string | null => value === null || value === undefined ? null : String(value)

function toHost(row: Row): Host {
  return {
    id: text(row.id), displayName: text(row.display_name), goals: JSON.parse(text(row.goals_json)), boundAt: text(row.bound_at),
    titleKey: nullableText(row.title_key),
  }
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
    expiresAt: nullableText(row.expires_at),
    skill: text(row.skill),
    sourceKey: nullableText(row.source_key),
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
    corroboratedBy: nullableText(row.corroborated_by),
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

function toEvent(row: Row): StoredEvent {
  return {
    eventId: text(row.event_id),
    type: text(row.type) as StoredEvent['type'],
    aggregateId: text(row.aggregate_id),
    occurredAt: text(row.occurred_at),
    causationId: text(row.causation_id),
    correlationId: text(row.correlation_id),
    schemaVersion: 1,
    payload: JSON.parse(text(row.payload_json)),
  }
}

function toConsent(row: Row): Consent {
  return {
    id: text(row.id),
    hostId: text(row.host_id),
    source: text(row.source) as Consent['source'],
    scopeRef: text(row.scope_ref),
    authorEmail: text(row.author_email),
    status: text(row.status) as Consent['status'],
    grantedAt: text(row.granted_at),
    revokedAt: nullableText(row.revoked_at),
  }
}

function toWorldEvent(row: Row): WorldEvent {
  return {
    id: text(row.id),
    hostId: text(row.host_id),
    consentId: text(row.consent_id),
    source: text(row.source) as WorldEvent['source'],
    externalId: text(row.external_id),
    observedAt: text(row.observed_at),
    summary: text(row.summary),
    filesChanged: Number(row.files_changed),
  }
}

function toNotice(row: Row): Notice {
  return {
    id: text(row.id),
    hostId: text(row.host_id),
    kind: text(row.kind) as Notice['kind'],
    title: text(row.title),
    body: text(row.body),
    createdAt: text(row.created_at),
    readAt: nullableText(row.read_at),
    sourceKey: text(row.source_key),
  }
}

function toMemory(row: Row): Memory {
  return {
    id: text(row.id),
    hostId: text(row.host_id),
    kind: text(row.kind) as Memory['kind'],
    text: text(row.text),
    sourceRef: nullableText(row.source_ref),
    createdAt: text(row.created_at),
    forgottenAt: nullableText(row.forgotten_at),
  }
}

function toAssessment(row: Row): SkillAssessment {
  return {
    id: text(row.id),
    hostId: text(row.host_id),
    skill: text(row.skill),
    tier: Number(row.tier) as SkillAssessment['tier'],
    confidence: text(row.confidence) as SkillAssessment['confidence'],
    ruleVersion: text(row.rule_version),
    basis: JSON.parse(text(row.basis_json)),
    questIds: JSON.parse(text(row.quest_ids_json)),
    evidenceIds: JSON.parse(text(row.evidence_ids_json)),
    assessedAt: text(row.assessed_at),
  }
}

function toAchievement(row: Row): Achievement {
  return {
    id: text(row.id),
    hostId: text(row.host_id),
    key: text(row.key),
    kind: text(row.kind) as Achievement['kind'],
    name: text(row.name),
    description: text(row.description),
    ruleVersion: text(row.rule_version),
    causeRef: nullableText(row.cause_ref),
    grantedAt: text(row.granted_at),
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
