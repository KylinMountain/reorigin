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
