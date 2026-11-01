import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReOriginApp, type Clock, type CommandOutcome, type IdSource } from '@reorigin/application'
import { SqliteStore, originSlug, probeWorkspace } from '../src/index.ts'

/** Passive input: consented activity is attached to open quests on the heartbeat. */

let dir: string
let store: SqliteStore
let app: ReOriginApp
let nowMs: number
let counter: number
let seq: number
let hostId = ''

const clock: Clock = {
  now: () => new Date(nowMs).toISOString(),
  localHour: iso => new Date(iso).getUTCHours(),
  localDay: iso => iso.slice(0, 10),
  localDayStart: iso => `${iso.slice(0, 10)}T00:00:00.000Z`,
}
const ids: IdSource = { next: prefix => `${prefix}_${++counter}` }
const at = (iso: string): void => { nowMs = Date.parse(iso) }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reorigin-tracking-'))
  store = new SqliteStore(join(dir, 'db'))
  app = new ReOriginApp({ store, clock, ids })
  counter = 0
  seq = 0
  at('2026-10-30T12:00:00.000Z')
  const bound = run('BindHost', { displayName: 'K', goals: [] })
  if (bound.type === 'BindHost') hostId = bound.host.id
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

function run(type: string, payload: object): CommandOutcome {
  const result = app.execute({ commandId: `cmd-${String(++seq).padStart(4, '0')}`, actor: 'host', issuedAt: clock.now(), schemaVersion: 1, type, payload, hostId })
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

function accepted(criteria: object[], title = 'q'): string {
  const outcome = run('ProposeQuest', { type: 'side', title, criteria, xp: 100 })
  if (outcome.type !== 'ProposeQuest') throw new Error('unexpected')
  run('AcceptQuest', { questId: outcome.quest.id })
  return outcome.quest.id
}

function grant(payload: object): string {
  const outcome = run('GrantConsent', payload)
  if (outcome.type !== 'GrantConsent') throw new Error('unexpected')
  return outcome.consent.id
}

const commits = (n: number, iso: string) => ({ sha: `${String(n).padStart(2, '0')}${'cd'.repeat(19)}`, committedAt: iso, subject: `commit ${n}`, filesChanged: 1 })
const quest = (id: string) => app.dashboard().quests.find(item => item.id === id)!
const commitCriterion = (minCount: number) => ({ kind: 'git_commit', minCount, description: `${minCount} commits` })

describe('evidence tracking', () => {
  it('collects partial evidence without a verdict, then completes once the criteria are met', () => {
    const repo = grant({ source: 'git_repo', scopeRef: '/repo', author: 'me@example.com' })
    const id = accepted([commitCriterion(2)])
    app.ingestCommits(repo, [commits(1, '2026-10-30T13:00:00Z')])
    at('2026-10-30T14:00:00.000Z')
    expect(app.tick().tracked).toBe(1)
    expect(quest(id)).toMatchObject({ status: 'IN_PROGRESS', lastVerification: null })
    expect(quest(id).evidenceIds).toHaveLength(1)

    app.ingestCommits(repo, [commits(2, '2026-10-30T15:00:00Z')])
    at('2026-10-30T16:00:00.000Z')
    app.tick()
    expect(quest(id)).toMatchObject({ status: 'COMPLETED', settled: false })
    expect(quest(id).lastVerification?.verdict).toBe('pass')
    expect(app.dashboard().notices.map(notice => notice.title)).toEqual(expect.arrayContaining(['【自动取证】', '【任务达成】']))
    // Payout stays the Host's moment.
    expect(app.dashboard().progress.xp).toBe(0)
  })

  it('ignores activity before acceptance and never uses one event for two quests', () => {
    const repo = grant({ source: 'git_repo', scopeRef: '/repo', author: 'me@example.com' })
    app.ingestCommits(repo, [commits(1, '2026-10-30T11:00:00Z')])
    const first = accepted([commitCriterion(1)], 'first')
    at('2026-10-30T12:30:00.000Z')
    const second = accepted([commitCriterion(1)], 'second')
    app.ingestCommits(repo, [commits(2, '2026-10-30T13:00:00Z')])
    at('2026-10-30T14:00:00.000Z')
    app.tick()
    // The older acceptance gets the only eligible commit; the earlier commit counts for nobody.
    expect([quest(first).status, quest(second).status]).toEqual(['COMPLETED', 'ACCEPTED'])
    expect(app.tick().tracked).toBe(0)
  })

  it('attaches merged pull requests as links and skips manual-only quests', () => {
    const gh = grant({ source: 'github_repo', scopeRef: 'owner/repo', author: 'me' })
    const linkQuest = accepted([{ kind: 'link', minCount: 1, description: 'one PR' }])
    const manual = accepted([{ kind: 'manual', minCount: 1, description: 'tell me' }])
    app.ingestPullRequests(gh, [{ number: 7, title: 'feat', mergedAt: '2026-10-30T13:00:00Z' }])
    at('2026-10-30T14:00:00.000Z')
    app.tick()
    expect(quest(linkQuest).status).toBe('COMPLETED')
    expect(quest(manual).status).toBe('ACCEPTED')
  })

  it('stays out of the way when the Host turns it off', () => {
    const repo = grant({ source: 'git_repo', scopeRef: '/repo', author: 'me@example.com' })
    run('UpdatePreferences', { quietHours: null, systemProposalsPerDay: 0, autoEvidence: false })
    const id = accepted([commitCriterion(1)])
    app.ingestCommits(repo, [commits(1, '2026-10-30T13:00:00Z')])
    at('2026-10-30T14:00:00.000Z')
    expect(app.tick().tracked).toBe(0)
    expect(quest(id).status).toBe('ACCEPTED')
    expect(app.dashboard().preferences?.autoEvidence).toBe(false)
  })
})

describe('workspace discovery', () => {
  it('reads GitHub slugs from HTTPS and SSH remotes', () => {
    expect(['git@github.com:Owner/Repo.git', 'ssh://git@github.com/o/r', 'https://github.com/o/r.git', 'git@gitlab.com:o/r.git'].map(originSlug))
      .toEqual(['owner/repo', 'o/r', 'o/r', null])
  })

  it('collapses a subdirectory to its work tree with the author and origin git would use', async () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'reorigin-probe-')))
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args])
    git('init', '-q')
    git('config', 'user.email', 'me@example.com')
    git('remote', 'add', 'origin', 'git@github.com:Me/Thing.git')
    mkdirSync(join(repo, 'src'))
    try {
      expect(await probeWorkspace(join(repo, 'src'))).toEqual({ root: repo, author: 'me@example.com', githubSlug: 'me/thing' })
      expect(await probeWorkspace(tmpdir())).toBeNull()
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})
