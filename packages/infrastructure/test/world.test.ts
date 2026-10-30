import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReOriginApp, type Clock, type CommandOutcome, type IdSource } from '@reorigin/application'
import { SqliteStore, isGitRepository, readCommits } from '../src/index.ts'

/** P1 tail, P2 memory, P3 world, P4 notices — end to end on SQLite with a controllable clock. */

let dir: string
let store: SqliteStore
let app: ReOriginApp
let nowMs: number
let counter: number
let seq: number

const clock: Clock = {
  now: () => new Date(nowMs).toISOString(),
  localHour: iso => new Date(iso).getUTCHours(),
  localDay: iso => iso.slice(0, 10),
  localDayStart: iso => `${iso.slice(0, 10)}T00:00:00.000Z`,
}
const ids: IdSource = { next: prefix => `${prefix}_${++counter}` }
const DAY = 86_400_000
const at = (iso: string): void => { nowMs = Date.parse(iso) }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reorigin-world-'))
  store = new SqliteStore(join(dir, 'db'))
  app = new ReOriginApp({ store, clock, ids })
  counter = 0
  seq = 0
  at('2026-10-30T12:00:00.000Z')
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

let hostId = ''
function run(type: string, payload: object): CommandOutcome {
  const result = app.execute({ commandId: `cmd-${String(++seq).padStart(4, '0')}`, actor: 'host', issuedAt: clock.now(), schemaVersion: 1, type, payload, hostId })
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

function bind(goals: string[] = ['工程成长']): void {
  const bound = run('BindHost', { displayName: 'K', goals })
  if (bound.type === 'BindHost') hostId = bound.host.id
}

function quest(payload: object = {}): string {
  const outcome = run('ProposeQuest', { type: 'side', title: 'q', criteria: [{ kind: 'git_commit', minCount: 1, description: 'c' }], xp: 120, ...payload })
  if (outcome.type !== 'ProposeQuest') throw new Error('unexpected')
  return outcome.quest.id
}

function grant(): string {
  const outcome = run('GrantConsent', { source: 'git_repo', scopeRef: '/repo/app', authorEmail: 'Me@Example.com' })
  if (outcome.type !== 'GrantConsent') throw new Error('unexpected')
  return outcome.consent.id
}

const sha = (n: number): string => `${String(n).padStart(2, '0')}${'ab'.repeat(19)}`
const commit = (n: number, iso: string) => ({ sha: sha(n), committedAt: iso, subject: `commit ${n}`, filesChanged: 2 })

describe('deadlines (P1 tail)', () => {
  it('expires unstarted quests on tick, defaults daily quests to one day, and spares submitted work', () => {
    bind()
    const daily = quest({ type: 'daily' })
    const submitted = quest({ expiresInDays: 1 })
    run('AcceptQuest', { questId: submitted })
    run('SubmitQuestEvidence', { questId: submitted, evidence: [{ kind: 'link', ref: 'https://x', observedAt: clock.now(), attested: true }] })
    at('2026-11-01T12:00:00.000Z')
    expect(app.tick().expired).toBe(1)
    const statuses = Object.fromEntries(app.dashboard().quests.map(item => [item.id, item.status]))
    expect(statuses).toEqual({ [daily]: 'EXPIRED', [submitted]: 'SUBMITTED' })
    expect(app.dashboard().notices.map(notice => notice.kind)).toContain('expired')
  })

  it('applies a passed deadline before acting on a command', () => {
    bind()
    const id = quest({ expiresInDays: 1 })
    at('2026-11-02T12:00:00.000Z')
    expect(app.execute({ commandId: 'late-accept', actor: 'host', issuedAt: clock.now(), schemaVersion: 1, type: 'AcceptQuest', payload: { questId: id }, hostId }))
      .toMatchObject({ ok: false, error: { code: 'quest/illegal-transition' } })
  })
})

describe('consented git source (P3)', () => {
  it('corroborates a commit by SHA prefix without attestation, using the repository time', () => {
    bind()
    const consent = grant()
    const id = quest()
    run('AcceptQuest', { questId: id })
    at('2026-10-30T15:00:00.000Z')
    expect(app.ingestCommits(consent, [commit(1, '2026-10-30T14:00:00Z'), commit(1, '2026-10-30T14:00:00Z')])).toEqual({ ok: true, value: { added: 1 } })
    // The Host claims a later time; the repository's 14:00 wins.
    const submitted = run('SubmitQuestEvidence', { questId: id, evidence: [{ kind: 'git_commit', ref: sha(1).slice(0, 8).toUpperCase(), observedAt: '2026-10-30T15:00:00Z' }] })
    if (submitted.type !== 'SubmitQuestEvidence') throw new Error('unexpected')
    expect(run('VerifyQuest', { questId: id })).toMatchObject({ quest: { status: 'COMPLETED' } })
  })

  it('cannot launder an old commit as new: corroborated time predates acceptance', () => {
    bind()
    const consent = grant()
    app.ingestCommits(consent, [commit(2, '2026-10-29T09:00:00Z')])
    const id = quest()
    run('AcceptQuest', { questId: id })
    run('SubmitQuestEvidence', { questId: id, evidence: [{ kind: 'git_commit', ref: sha(2), observedAt: clock.now(), attested: true }] })
    expect(run('VerifyQuest', { questId: id })).toMatchObject({ quest: { status: 'NEEDS_EVIDENCE' }, verification: { reasons: [{ code: 'before_acceptance' }, { code: 'criterion_unmet' }] } })
  })

  it('stops collecting and corroborating on revoke, and deletes collected data on request', () => {
    bind()
    const consent = grant()
    app.ingestCommits(consent, [commit(3, '2026-10-30T11:00:00Z')])
    expect(app.dashboard().recentCommits).toHaveLength(1)
    expect(run('RevokeConsent', { consentId: consent, deleteData: true })).toMatchObject({ consent: { status: 'revoked' }, deletedEvents: 1 })
    expect(app.ingestCommits(consent, [commit(4, '2026-10-30T11:30:00Z')])).toMatchObject({ ok: false, error: { code: 'consent/inactive' } })
    expect(app.dashboard().recentCommits).toEqual([])
    expect(app.activeConsents()).toEqual([])
  })

  it('proposes a hidden quest from a streak once, within the daily cap and outside quiet hours', () => {
    bind()
    const consent = grant()
    app.ingestCommits(consent, [commit(5, '2026-10-26T10:00:00Z'), commit(6, '2026-10-28T10:00:00Z'), commit(7, '2026-10-30T10:00:00Z')])
    at('2026-10-30T02:00:00.000Z') // inside the default 23–8 quiet hours
    expect(app.tick().proposed).toBe(0)
    at('2026-10-30T12:00:00.000Z')
    expect(app.tick().proposed).toBe(1)
    expect(app.tick().proposed).toBe(0) // same opportunity, same source key
    const hidden = app.dashboard().quests.find(item => item.type === 'hidden')!
    expect(hidden).toMatchObject({ source: 'system', status: 'PROPOSED', sourceKey: 'world-v1:streak:2026-10-30' })
    expect(app.dashboard().notices.map(notice => notice.title)).toContain('【隐藏任务出现】')
    // A new streak day is a new opportunity, but the Host capped the System at zero per day.
    run('UpdatePreferences', { quietHours: null, systemProposalsPerDay: 0 })
    app.ingestCommits(consent, [commit(8, '2026-10-31T10:00:00Z')])
    at('2026-10-31T12:00:00.000Z')
    expect(app.tick().proposed).toBe(0)
  })
})

describe('outbox, notices, and memory (P2/P4)', () => {
  it('turns a settlement into reward and level-up notices and a milestone memory, exactly once', () => {
    bind()
    const id = quest({ skill: '测试工程' })
    run('AcceptQuest', { questId: id })
    run('SubmitQuestEvidence', { questId: id, evidence: [{ kind: 'git_commit', ref: 'deadbeef', observedAt: clock.now(), attested: true }] })
    run('VerifyQuest', { questId: id })
    run('SettleQuest', { questId: id })
    app.tick()
    app.tick()
    const dashboard = app.dashboard()
    expect(dashboard.notices.map(notice => notice.kind).sort()).toEqual(['achievement', 'level_up', 'reward', 'skill'])
    expect(dashboard.notices.find(notice => notice.kind === 'level_up')!.title).toBe('【升级】Lv.2')
    expect(dashboard.memories).toEqual([expect.objectContaining({ kind: 'milestone', text: '完成了「q」（测试工程）' })])
    expect(dashboard.growth).toEqual([{ skill: '测试工程', completions: 1, xp: 120, lastCompletedAt: expect.any(String) }])
    run('MarkNoticesRead', {})
    expect(app.dashboard().unreadNotices).toBe(0)
  })

  it('lets only the Host add and forget memories, and briefs the agent with active ones', () => {
    bind()
    const added = run('AddMemory', { text: '我更喜欢早上做深度工作' })
    if (added.type !== 'AddMemory') throw new Error('unexpected')
    expect(app.agentBrief()).toMatchObject({ memories: ['我更喜欢早上做深度工作'], chapter: '觉醒' })
    expect(app.execute({ commandId: 'agent-mem-1', actor: 'agent', issuedAt: clock.now(), schemaVersion: 1, type: 'AddMemory', payload: { text: 'x' }, hostId }))
      .toMatchObject({ ok: false, error: { code: 'command/forbidden' } })
    run('ForgetMemory', { memoryId: added.memory.id })
    expect(app.agentBrief()).toMatchObject({ memories: [] })
    expect(app.execute({ commandId: 'forget-again', actor: 'host', issuedAt: clock.now(), schemaVersion: 1, type: 'ForgetMemory', payload: { memoryId: added.memory.id }, hostId }))
      .toMatchObject({ ok: false, error: { code: 'memory/not-found' } })
  })

  it('validates consent input', () => {
    bind()
    expect(app.execute({ commandId: 'bad-grant-1', actor: 'host', issuedAt: clock.now(), schemaVersion: 1, type: 'GrantConsent', payload: { source: 'git_repo', scopeRef: 'relative/path', authorEmail: 'a@b.co' }, hostId }))
      .toMatchObject({ ok: false, error: { code: 'command/invalid' } })
    grant()
    expect(app.execute({ commandId: 'dup-grant-1', actor: 'host', issuedAt: clock.now(), schemaVersion: 1, type: 'GrantConsent', payload: { source: 'git_repo', scopeRef: '/repo/app', authorEmail: 'a@b.co' }, hostId }))
      .toMatchObject({ ok: false, error: { code: 'consent/duplicate' } })
  })
})

describe('git collector', () => {
  it('reads only the consented author and only the privacy projection', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'reorigin-repo-'))
    try {
      const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } })
      git('init', '-q')
      const commitAs = (email: string, file: string, message: string): void => {
        writeFileSync(join(repo, file), `${file}\n`)
        git('add', file)
        git('-c', `user.name=${email}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', message)
      }
      commitAs('me@example.com', 'a.txt', 'add a secret-named file')
      commitAs('other@example.com', 'b.txt', 'someone else')
      commitAs('me@example.com', 'c.txt', 'second')
      expect(await isGitRepository(repo)).toBe(true)
      expect(await isGitRepository(tmpdir())).toBe(false)
      const commits = await readCommits({ repo, authorEmail: 'ME@example.com', since: '2000-01-01' })
      expect(commits.map(item => item.subject)).toEqual(['second', 'add a secret-named file'])
      expect(commits.every(item => /^[0-9a-f]{40}$/.test(item.sha) && item.filesChanged === 1)).toBe(true)
      expect(JSON.stringify(commits)).not.toContain('a.txt')
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})
