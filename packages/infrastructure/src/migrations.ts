import type { DatabaseSync } from 'node:sqlite'

/**
 * Ordered, append-only migrations. Never edit a shipped entry; add the next
 * one. `PRAGMA user_version` records how many have run.
 */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE hosts (
     id TEXT PRIMARY KEY,
     display_name TEXT NOT NULL,
     goals_json TEXT NOT NULL,
     bound_at TEXT NOT NULL
   );
   CREATE TABLE quests (
     id TEXT PRIMARY KEY,
     host_id TEXT NOT NULL REFERENCES hosts(id),
     type TEXT NOT NULL,
     source TEXT NOT NULL,
     title TEXT NOT NULL,
     objective TEXT NOT NULL,
     criteria_json TEXT NOT NULL,
     reward_rule_version TEXT NOT NULL,
     reward_xp INTEGER NOT NULL,
     status TEXT NOT NULL,
     revision INTEGER NOT NULL,
     proposed_at TEXT NOT NULL,
     accepted_at TEXT,
     closed_at TEXT,
     evidence_ids_json TEXT NOT NULL
   );
   CREATE INDEX quests_by_host ON quests(host_id, proposed_at);
   CREATE TABLE evidence (
     id TEXT PRIMARY KEY,
     host_id TEXT NOT NULL REFERENCES hosts(id),
     kind TEXT NOT NULL,
     ref TEXT NOT NULL,
     summary TEXT NOT NULL,
     observed_at TEXT NOT NULL,
     recorded_at TEXT NOT NULL,
     content_hash TEXT NOT NULL,
     attested INTEGER NOT NULL
   );
   CREATE INDEX evidence_by_hash ON evidence(host_id, content_hash);
   CREATE TABLE verifications (
     id TEXT PRIMARY KEY,
     quest_id TEXT NOT NULL REFERENCES quests(id),
     verdict TEXT NOT NULL,
     rule_version TEXT NOT NULL,
     accepted_evidence_ids_json TEXT NOT NULL,
     reasons_json TEXT NOT NULL,
     verified_at TEXT NOT NULL
   );
   CREATE INDEX verifications_by_quest ON verifications(quest_id, verified_at);
   CREATE TABLE reward_ledger (
     id TEXT PRIMARY KEY,
     host_id TEXT NOT NULL REFERENCES hosts(id),
     quest_id TEXT NOT NULL REFERENCES quests(id),
     reward_type TEXT NOT NULL,
     amount INTEGER NOT NULL,
     rule_version TEXT NOT NULL,
     idempotency_key TEXT NOT NULL UNIQUE,
     granted_at TEXT NOT NULL
   );
   CREATE TABLE events (
     event_id TEXT PRIMARY KEY,
     type TEXT NOT NULL,
     aggregate_id TEXT NOT NULL,
     occurred_at TEXT NOT NULL,
     causation_id TEXT NOT NULL,
     correlation_id TEXT NOT NULL,
     schema_version INTEGER NOT NULL,
     payload_json TEXT NOT NULL
   );
   CREATE INDEX events_by_aggregate ON events(aggregate_id, occurred_at);
   CREATE TABLE outbox (
     event_id TEXT PRIMARY KEY REFERENCES events(event_id),
     dispatched_at TEXT
   );
   CREATE TABLE processed_commands (
     command_id TEXT PRIMARY KEY,
     command_type TEXT NOT NULL,
     result_json TEXT NOT NULL,
     processed_at TEXT NOT NULL
   );
   CREATE TRIGGER events_append_only_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
   CREATE TRIGGER events_append_only_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
   CREATE TRIGGER ledger_append_only_update BEFORE UPDATE ON reward_ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
   CREATE TRIGGER ledger_append_only_delete BEFORE DELETE ON reward_ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;`,
  // P2: why a quest was suggested (required from agents).
  `ALTER TABLE quests ADD COLUMN rationale TEXT NOT NULL DEFAULT '';`,
  // P1 tail + P3 + P4: deadlines, growth tags, consented world sources, notices, memories.
  `ALTER TABLE quests ADD COLUMN expires_at TEXT;
   ALTER TABLE quests ADD COLUMN skill TEXT NOT NULL DEFAULT '';
   ALTER TABLE quests ADD COLUMN source_key TEXT;
   CREATE UNIQUE INDEX quests_by_source_key ON quests(host_id, source_key) WHERE source_key IS NOT NULL;
   ALTER TABLE evidence ADD COLUMN corroborated_by TEXT;
   ALTER TABLE hosts ADD COLUMN preferences_json TEXT;
   CREATE TABLE consents (
     id TEXT PRIMARY KEY,
     host_id TEXT NOT NULL REFERENCES hosts(id),
     source TEXT NOT NULL,
     scope_ref TEXT NOT NULL,
     author_email TEXT NOT NULL,
     status TEXT NOT NULL,
     granted_at TEXT NOT NULL,
     revoked_at TEXT
   );
   CREATE TABLE world_events (
     id TEXT PRIMARY KEY,
     host_id TEXT NOT NULL REFERENCES hosts(id),
     consent_id TEXT NOT NULL REFERENCES consents(id),
     source TEXT NOT NULL,
     external_id TEXT NOT NULL,
     observed_at TEXT NOT NULL,
     summary TEXT NOT NULL,
     files_changed INTEGER NOT NULL,
     UNIQUE (consent_id, external_id)
   );
   CREATE INDEX world_events_by_time ON world_events(host_id, observed_at);
   CREATE TABLE notices (
     id TEXT PRIMARY KEY,
     host_id TEXT NOT NULL REFERENCES hosts(id),
     kind TEXT NOT NULL,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     created_at TEXT NOT NULL,
     read_at TEXT,
     source_key TEXT NOT NULL UNIQUE
   );
   CREATE TABLE memories (
     id TEXT PRIMARY KEY,
     host_id TEXT NOT NULL REFERENCES hosts(id),
     kind TEXT NOT NULL,
     text TEXT NOT NULL,
     source_ref TEXT,
     created_at TEXT NOT NULL,
     forgotten_at TEXT
   );
   CREATE UNIQUE INDEX memories_by_source ON memories(host_id, source_ref) WHERE source_ref IS NOT NULL;`,
  // Growth Engine and achievements: evidence-based skill assessments, badges and titles. Both append-only.
  `CREATE TABLE skill_assessments (
     id TEXT PRIMARY KEY,
     host_id TEXT NOT NULL REFERENCES hosts(id),
     skill TEXT NOT NULL,
     tier INTEGER NOT NULL,
     confidence TEXT NOT NULL,
     rule_version TEXT NOT NULL,
     basis_json TEXT NOT NULL,
     quest_ids_json TEXT NOT NULL,
     evidence_ids_json TEXT NOT NULL,
     assessed_at TEXT NOT NULL
   );
   CREATE INDEX skill_assessments_by_skill ON skill_assessments(host_id, skill, assessed_at);
   CREATE TABLE achievements (
     id TEXT PRIMARY KEY,
     host_id TEXT NOT NULL REFERENCES hosts(id),
     key TEXT NOT NULL,
     kind TEXT NOT NULL,
     name TEXT NOT NULL,
     description TEXT NOT NULL,
     rule_version TEXT NOT NULL,
     cause_ref TEXT,
     granted_at TEXT NOT NULL,
     UNIQUE (host_id, key)
   );
   ALTER TABLE hosts ADD COLUMN title_key TEXT;
   CREATE TRIGGER assessments_append_only_update BEFORE UPDATE ON skill_assessments BEGIN SELECT RAISE(ABORT, 'assessments are append-only'); END;
   CREATE TRIGGER assessments_append_only_delete BEFORE DELETE ON skill_assessments BEGIN SELECT RAISE(ABORT, 'assessments are append-only'); END;
   CREATE TRIGGER achievements_append_only_update BEFORE UPDATE ON achievements BEGIN SELECT RAISE(ABORT, 'achievements are append-only'); END;
   CREATE TRIGGER achievements_append_only_delete BEFORE DELETE ON achievements BEGIN SELECT RAISE(ABORT, 'achievements are append-only'); END;`,
  // Host sovereignty: pausing quests, and erasing every record when the Host deletes their data.
  // Append-only tables still refuse deletes, except inside a purge that holds the purge_guard row.
  `ALTER TABLE quests ADD COLUMN paused_at TEXT;
   CREATE TABLE purge_guard (active INTEGER NOT NULL);
   DROP TRIGGER events_append_only_delete;
   CREATE TRIGGER events_append_only_delete BEFORE DELETE ON events WHEN NOT EXISTS (SELECT 1 FROM purge_guard) BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
   DROP TRIGGER ledger_append_only_delete;
   CREATE TRIGGER ledger_append_only_delete BEFORE DELETE ON reward_ledger WHEN NOT EXISTS (SELECT 1 FROM purge_guard) BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
   DROP TRIGGER assessments_append_only_delete;
   CREATE TRIGGER assessments_append_only_delete BEFORE DELETE ON skill_assessments WHEN NOT EXISTS (SELECT 1 FROM purge_guard) BEGIN SELECT RAISE(ABORT, 'assessments are append-only'); END;
   DROP TRIGGER achievements_append_only_delete;
   CREATE TRIGGER achievements_append_only_delete BEFORE DELETE ON achievements WHEN NOT EXISTS (SELECT 1 FROM purge_guard) BEGIN SELECT RAISE(ABORT, 'achievements are append-only'); END;`,
]

export const SCHEMA_VERSION = MIGRATIONS.length

export function migrate(db: DatabaseSync): void {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
  if (current > SCHEMA_VERSION) {
    throw new Error(`reorigin: database schema ${current} is newer than this build (${SCHEMA_VERSION}); refusing to downgrade`)
  }
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(MIGRATIONS[version]!)
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
