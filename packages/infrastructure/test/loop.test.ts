import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReOriginApp, type Clock, type CommandOutcome, type IdSource } from '@reorigin/application'
import { SqliteStore } from '../src/index.ts'

/**
 * The P1 acceptance loop end to end on a real SQLite file:
 * bind → propose → accept → submit evidence → verify → settle → restart.
 */

let dir: string
let path: string
let stores: SqliteStore[]
let tick: number

const clock: Clock = { now: () => new Date(Date.UTC(2026, 9, 30, 10, 0, tick++)).toISOString() }
let counter = 0
const ids: IdSource = { next: prefix => `${prefix}_${++counter}` }

function open(): ReOriginApp {
  const store = new SqliteStore(path)
  stores.push(store)
  return new ReOriginApp({ store, clock, ids })
}

let commandSeq = 0
function cmd(type: string, payload: object, extra: object = {}): object {
  return { commandId: `cmd-${String(++commandSeq).padStart(4, '0')}`, actor: 'host', issuedAt: clock.now(), schemaVersion: 1, type, payload, ...extra }
}

function ok(result: ReturnType<ReOriginApp['execute']>): CommandOutcome {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

function later(): string {
  return new Date(Date.UTC(2026, 9, 30, 10, 0, tick++)).toISOString()
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reorigin-'))
  path = join(dir, 'reorigin.db')
  stores = []
  tick = 0
})

afterEach(() => {
  for (const store of stores) store.close()
  rmSync(dir, { recursive: true, force: true })
})

function bindAndAccept(app: ReOriginApp, xp = 120): { hostId: string, questId: string } {
  const bound = ok(app.execute(cmd('BindHost', { displayName: 'Kylin', goals: ['工程能力成长'] })))
  if (bound.type !== 'BindHost') throw new Error('unexpected outcome')
  const hostId = bound.host.id
  const proposed = ok(app.execute(cmd('ProposeQuest', {
    type: 'side', title: '构筑质量防线', objective: '为核心模块补回归测试',
    criteria: [{ kind: 'git_commit', minCount: 1, description: '一次包含测试的提交' }], xp,
  }, { hostId })))
  if (proposed.type !== 'ProposeQuest') throw new Error('unexpected outcome')
  expect(proposed.quest.status).toBe('AVAILABLE')
  ok(app.execute(cmd('AcceptQuest', { questId: proposed.quest.id }, { hostId })))
  return { hostId, questId: proposed.quest.id }
}

describe('P1 growth loop on SQLite', () => {
  it('completes a quest, grants XP exactly once, and survives a restart', () => {
    const app = open()
    const { hostId, questId } = bindAndAccept(app)
    ok(app.execute(cmd('SubmitQuestEvidence', { questId, evidence: [{ kind: 'git_commit', ref: 'a1b2c3d', observedAt: later() }] }, { hostId })))
    const verified = ok(app.execute(cmd('VerifyQuest', { questId }, { hostId })))
    expect(verified).toMatchObject({ quest: { status: 'COMPLETED' }, verification: { verdict: 'pass' } })

    const settle = cmd('SettleQuest', { questId }, { hostId })
    expect(ok(app.execute(settle))).toMatchObject({ granted: true, entry: { amount: 120 } })
    // Same command replayed, and a fresh command for the same quest: neither pays again.
    expect(ok(app.execute(settle))).toMatchObject({ granted: true })
    expect(ok(app.execute(cmd('SettleQuest', { questId }, { hostId })))).toMatchObject({ granted: false })
    expect(app.dashboard().progress).toMatchObject({ xp: 120, level: 2 })

    const reopened = open().dashboard()
    expect(reopened.host?.displayName).toBe('Kylin')
    expect(reopened.progress.xp).toBe(120)
    expect(reopened.quests[0]).toMatchObject({ id: questId, status: 'COMPLETED', settled: true, lastVerification: { verdict: 'pass' } })
  })

  it('asks for evidence again, then completes after a valid resubmission', () => {
    const app = open()
    const { hostId, questId } = bindAndAccept(app)
    ok(app.execute(cmd('SubmitQuestEvidence', { questId, evidence: [{ kind: 'link', ref: 'https://example.com', observedAt: later() }] }, { hostId })))
    expect(ok(app.execute(cmd('VerifyQuest', { questId }, { hostId })))).toMatchObject({ quest: { status: 'NEEDS_EVIDENCE' } })
    expect(app.execute(cmd('SettleQuest', { questId }, { hostId }))).toMatchObject({ ok: false, error: { code: 'settlement/not-completed' } })

    ok(app.execute(cmd('SubmitQuestEvidence', { questId, evidence: [{ kind: 'git_commit', ref: 'f00d', observedAt: later() }] }, { hostId })))
    expect(ok(app.execute(cmd('VerifyQuest', { questId }, { hostId })))).toMatchObject({ quest: { status: 'COMPLETED' } })
  })

  it('does not count the same evidence for two quests', () => {
    const app = open()
    const { hostId, questId } = bindAndAccept(app)
    const commit = { kind: 'git_commit', ref: 'same-sha', observedAt: later() }
    ok(app.execute(cmd('SubmitQuestEvidence', { questId, evidence: [commit] }, { hostId })))
    ok(app.execute(cmd('VerifyQuest', { questId }, { hostId })))

    const second = ok(app.execute(cmd('ProposeQuest', {
      type: 'daily', title: 'again', criteria: [{ kind: 'git_commit', minCount: 1, description: 'commit' }], xp: 10,
    }, { hostId })))
    if (second.type !== 'ProposeQuest') throw new Error('unexpected outcome')
    ok(app.execute(cmd('AcceptQuest', { questId: second.quest.id }, { hostId })))
    ok(app.execute(cmd('SubmitQuestEvidence', { questId: second.quest.id, evidence: [{ ...commit, observedAt: later() }] }, { hostId })))
    const verdict = ok(app.execute(cmd('VerifyQuest', { questId: second.quest.id }, { hostId })))
    expect(verdict).toMatchObject({ quest: { status: 'NEEDS_EVIDENCE' }, verification: { reasons: [expect.stringContaining('already counted'), expect.any(String)] } })
  })

  it('lets an agent propose but never accept, submit, verify, or settle', () => {
    const app = open()
    const { hostId } = bindAndAccept(app)
    const proposal = ok(app.execute(cmd('ProposeQuest', {
      type: 'side', title: 'agent idea', criteria: [{ kind: 'manual', minCount: 1, description: 'note' }], xp: 50,
    }, { hostId, actor: 'agent' })))
    if (proposal.type !== 'ProposeQuest') throw new Error('unexpected outcome')
    expect(proposal.quest).toMatchObject({ status: 'PROPOSED', source: 'agent' })
    for (const type of ['AcceptQuest', 'VerifyQuest', 'SettleQuest']) {
      expect(app.execute(cmd(type, { questId: proposal.quest.id }, { hostId, actor: 'agent' }))).toMatchObject({ ok: false, error: { code: 'command/forbidden' } })
    }
    // The Host reviewing the proposal accepts it straight from PROPOSED.
    expect(ok(app.execute(cmd('AcceptQuest', { questId: proposal.quest.id }, { hostId })))).toMatchObject({ quest: { status: 'ACCEPTED' } })
  })

  it('validates input and rejects a second bind', () => {
    const app = open()
    expect(app.execute({ type: 'BindHost' })).toMatchObject({ ok: false, error: { code: 'command/invalid' } })
    ok(app.execute(cmd('BindHost', { displayName: 'A' })))
    expect(app.execute(cmd('BindHost', { displayName: 'B' }))).toMatchObject({ ok: false, error: { code: 'host/already-bound' } })
  })

  it('rolls back every write of a failed command', () => {
    const app = open()
    const { hostId, questId } = bindAndAccept(app)
    const before = new DatabaseSync(path).prepare('SELECT COUNT(*) AS n FROM evidence').get() as { n: number }
    // Evidence observed after it is recorded fails inside the transaction after the IN_PROGRESS move.
    const future = new Date(Date.UTC(2030, 0, 1)).toISOString()
    expect(app.execute(cmd('SubmitQuestEvidence', { questId, evidence: [{ kind: 'git_commit', ref: 'x', observedAt: future }] }, { hostId })))
      .toMatchObject({ ok: false, error: { code: 'evidence/invalid' } })
    const db = new DatabaseSync(path)
    expect(db.prepare('SELECT COUNT(*) AS n FROM evidence').get()).toEqual(before)
    expect(db.prepare('SELECT status FROM quests WHERE id = ?').get(questId)).toEqual({ status: 'ACCEPTED' })
    db.close()
  })

  it('keeps the ledger and audit log append-only', () => {
    const app = open()
    const { hostId, questId } = bindAndAccept(app)
    ok(app.execute(cmd('SubmitQuestEvidence', { questId, evidence: [{ kind: 'git_commit', ref: 'c0ffee', observedAt: later() }] }, { hostId })))
    ok(app.execute(cmd('VerifyQuest', { questId }, { hostId })))
    ok(app.execute(cmd('SettleQuest', { questId }, { hostId })))
    const db = new DatabaseSync(path)
    expect(() => db.exec('DELETE FROM events')).toThrow(/append-only/)
    expect(() => db.exec('UPDATE reward_ledger SET amount = 999')).toThrow(/append-only/)
    db.close()
  })

  it('never pays more than the completed quests are worth under random command sequences', () => {
    const app = open()
    const { hostId } = bindAndAccept(app, 100)
    let seed = 42
    const random = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n }
    const types = ['ProposeQuest', 'AcceptQuest', 'CancelQuest', 'SubmitQuestEvidence', 'VerifyQuest', 'SettleQuest'] as const
    // Mostly advance the target along its happy path so settlement really happens; a third of the time, anything goes.
    const nextStep: Partial<Record<string, (typeof types)[number]>> = {
      PROPOSED: 'AcceptQuest', AVAILABLE: 'AcceptQuest', ACCEPTED: 'SubmitQuestEvidence', IN_PROGRESS: 'SubmitQuestEvidence',
      NEEDS_EVIDENCE: 'SubmitQuestEvidence', SUBMITTED: 'VerifyQuest', COMPLETED: 'SettleQuest',
    }
    const issued: object[] = []
    for (let step = 0; step < 400; step += 1) {
      const quests = app.dashboard().quests
      const target = quests[random(quests.length)]
      const planned = target === undefined ? undefined : nextStep[target.status]
      const type = random(3) === 0 || planned === undefined ? types[random(types.length)]! : planned
      const command = random(5) === 0 && issued.length > 0
        ? issued[random(issued.length)]! // replay an earlier command verbatim
        : type === 'ProposeQuest'
          ? cmd(type, { type: 'daily', title: `q${step}`, criteria: [{ kind: 'git_commit', minCount: 1, description: 'c' }], xp: 10 + random(50) }, { hostId })
          : type === 'SubmitQuestEvidence'
            ? cmd(type, { questId: target!.id, evidence: [{ kind: 'git_commit', ref: `sha${random(30)}`, observedAt: later() }] }, { hostId })
            : cmd(type, { questId: target!.id }, { hostId })
      issued.push(command)
      app.execute(command)
    }
    const { quests, progress } = app.dashboard()
    const db = new DatabaseSync(path)
    const ledger = db.prepare('SELECT quest_id, COUNT(*) AS n FROM reward_ledger GROUP BY quest_id').all() as { quest_id: string, n: number }[]
    db.close()
    // The sequence must actually exercise settlement, or the bounds below are vacuous.
    expect(ledger.length).toBeGreaterThan(1)
    expect(ledger.every(row => row.n === 1)).toBe(true)
    const completedValue = quests.filter(quest => quest.status === 'COMPLETED').reduce((sum, quest) => sum + quest.reward.xp, 0)
    expect(progress.xp).toBeLessThanOrEqual(completedValue)
    expect(quests.filter(quest => quest.settled).every(quest => quest.status === 'COMPLETED')).toBe(true)
  })
})
