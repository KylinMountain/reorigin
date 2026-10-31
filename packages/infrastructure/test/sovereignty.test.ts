import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReOriginApp, type Clock, type CommandOutcome, type IdSource } from '@reorigin/application'
import { SqliteStore } from '../src/index.ts'

/** Host sovereignty: pause without penalty, take the data away, erase it for good. */

let dir: string
let path: string
let store: SqliteStore
let app: ReOriginApp
let nowMs: number
let counter: number
let seq: number
let hostId: string

const clock: Clock = {
  now: () => new Date(nowMs).toISOString(),
  localHour: iso => new Date(iso).getUTCHours(),
  localDay: iso => iso.slice(0, 10),
  localDayStart: iso => `${iso.slice(0, 10)}T00:00:00.000Z`,
}
const ids: IdSource = { next: prefix => `${prefix}_${++counter}` }
const DAY = 86_400_000

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reorigin-sovereignty-'))
  path = join(dir, 'db')
  store = new SqliteStore(path)
  app = new ReOriginApp({ store, clock, ids })
  counter = 0
  seq = 0
  nowMs = Date.parse('2026-10-30T12:00:00.000Z')
  const bound = run('BindHost', { displayName: 'Kylin', goals: ['工程成长'] })
  if (bound.type === 'BindHost') hostId = bound.host.id
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

function attempt(type: string, payload: object, actor = 'host') {
  return app.execute({ commandId: `cmd-${String(++seq).padStart(4, '0')}`, actor, issuedAt: clock.now(), schemaVersion: 1, type, payload, hostId })
}

function run(type: string, payload: object): CommandOutcome {
  const result = attempt(type, payload)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

function accepted(days?: number): string {
  const outcome = run('ProposeQuest', {
    type: 'side', title: 'q', xp: 50, skill: '测试工程', criteria: [{ kind: 'manual', minCount: 1, description: 'note' }],
    ...(days === undefined ? {} : { expiresInDays: days }),
  })
  if (outcome.type !== 'ProposeQuest') throw new Error('unexpected')
  run('AcceptQuest', { questId: outcome.quest.id })
  return outcome.quest.id
}

const status = (questId: string) => app.dashboard().quests.find(quest => quest.id === questId)!

describe('pausing a quest', () => {
  it('stops the deadline while paused and pushes it back on resume', () => {
    const questId = accepted(1)
    const deadline = Date.parse(status(questId).expiresAt!)
    run('PauseQuest', { questId })
    nowMs += 3 * DAY
    app.tick()
    expect(status(questId)).toMatchObject({ status: 'PAUSED' })

    expect(run('ResumeQuest', { questId })).toMatchObject({ quest: { status: 'IN_PROGRESS', pausedAt: null } })
    expect(Date.parse(status(questId).expiresAt!)).toBe(deadline + 3 * DAY)
    nowMs += DAY / 2
    app.tick()
    expect(status(questId).status).toBe('IN_PROGRESS')
    nowMs += DAY
    app.tick()
    expect(status(questId).status).toBe('EXPIRED')
  })

  it('refuses evidence until resumed, and leaves pausing to the Host', () => {
    const questId = accepted()
    expect(attempt('PauseQuest', { questId }, 'agent')).toMatchObject({ ok: false, error: { code: 'command/forbidden' } })
    expect(attempt('ResumeQuest', { questId })).toMatchObject({ ok: false, error: { code: 'quest/illegal-transition' } })
    run('PauseQuest', { questId })
    expect(attempt('SubmitQuestEvidence', { questId, evidence: [{ kind: 'manual', ref: 'did it', observedAt: clock.now(), attested: true }] }))
      .toMatchObject({ ok: false, error: { code: 'quest/illegal-transition' } })
    expect(run('CancelQuest', { questId })).toMatchObject({ quest: { status: 'CANCELLED' } })
    expect(app.dashboard().audit.map(event => event.type)).toEqual(expect.arrayContaining(['quest.paused.v1']))
  })
})

describe('exporting and erasing the Host data', () => {
  it('exports every table with JSON columns decoded', () => {
    accepted()
    run('AddMemory', { text: '早上做深度工作' })
    const data = app.exportData()
    expect(data).toMatchObject({ format: 'reorigin-export', formatVersion: 1 })
    expect(Object.keys(data.tables)).toEqual(expect.arrayContaining(['hosts', 'quests', 'evidence', 'reward_ledger', 'events', 'memories', 'skill_assessments', 'achievements']))
    expect(data.tables.hosts![0]).toMatchObject({ display_name: 'Kylin', goals: ['工程成长'] })
    expect(data.tables.quests![0]).toMatchObject({ criteria: [{ kind: 'manual' }] })
    expect(data.tables.events!.length).toBeGreaterThan(0)
  })

  it('erases everything, append-only tables included, after the Host confirms by name', () => {
    const marker = 'ZEBRA-MARKER-4242'
    const questId = accepted()
    run('AddMemory', { text: marker })
    run('SubmitQuestEvidence', { questId, evidence: [{ kind: 'manual', ref: marker, observedAt: clock.now(), attested: true }] })
    run('VerifyQuest', { questId })
    run('SettleQuest', { questId })
    app.tick()
    expect(app.dashboard().achievements.length).toBeGreaterThan(0)

    expect(attempt('DeleteHost', { confirmName: 'kylin' })).toMatchObject({ ok: false, error: { code: 'host/confirmation-mismatch' } })
    expect(attempt('DeleteHost', { confirmName: 'Kylin' }, 'agent')).toMatchObject({ ok: false, error: { code: 'command/forbidden' } })
    expect(run('DeleteHost', { confirmName: 'Kylin' })).toMatchObject({ type: 'DeleteHost', removedRows: expect.any(Number) })
    store.checkpoint()

    expect(app.dashboard().host).toBeNull()
    const db = new DatabaseSync(path)
    for (const table of ['hosts', 'quests', 'evidence', 'verifications', 'reward_ledger', 'events', 'outbox', 'skill_assessments', 'achievements', 'memories', 'notices']) {
      expect(Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n), table).toBe(0)
    }
    db.close()
    // secure_delete + checkpoint: the bytes are gone from the file, not just unlinked from the tables.
    const bytes = Buffer.concat([readFileSync(path), ...existsSync(`${path}-wal`) ? [readFileSync(`${path}-wal`)] : []])
    expect(bytes.includes(Buffer.from(marker))).toBe(false)
    expect(bytes.includes(Buffer.from('Kylin'))).toBe(false)

    // The guard is released: append-only holds again, and the System can be bound afresh.
    const rebound = run('BindHost', { displayName: 'K2', goals: [] })
    if (rebound.type === 'BindHost') hostId = rebound.host.id
    expect(() => new DatabaseSync(path).exec('DELETE FROM events')).toThrow(/append-only/)
  })
})
