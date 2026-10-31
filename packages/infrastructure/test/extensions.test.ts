import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReOriginApp, type Clock, type CommandOutcome, type DataExport, type IdSource } from '@reorigin/application'
import { SqliteStore, systemClock } from '../src/index.ts'

/** GitHub source and link corroboration, explicit time zone, agent review notes, and restore from export. */

let dir: string
let stores: SqliteStore[]
let app: ReOriginApp
let nowMs: number
let counter: number
let seq: number
let hostId: string

// The real zone-aware calendar, with a controllable "now".
const clock: Clock = { ...systemClock, now: () => new Date(nowMs).toISOString() }
const ids: IdSource = { next: prefix => `${prefix}_${++counter}` }
const at = (iso: string): void => { nowMs = Date.parse(iso) }

function open(name = 'db'): ReOriginApp {
  const store = new SqliteStore(join(dir, name))
  stores.push(store)
  return new ReOriginApp({ store, clock, ids })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reorigin-ext-'))
  stores = []
  counter = 0
  seq = 0
  hostId = ''
  at('2026-10-30T12:00:00.000Z')
  app = open()
})

afterEach(() => {
  for (const store of stores) store.close()
  rmSync(dir, { recursive: true, force: true })
})

function attempt(type: string, payload: object, actor = 'host', target = app) {
  return target.execute({ commandId: `cmd-${String(++seq).padStart(4, '0')}`, actor, issuedAt: clock.now(), schemaVersion: 1, type, payload, hostId })
}

function run(type: string, payload: object, target = app): CommandOutcome {
  const result = attempt(type, payload, 'host', target)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

function bind(target = app): void {
  const bound = run('BindHost', { displayName: 'K', goals: ['交付'] }, target)
  if (bound.type === 'BindHost') hostId = bound.host.id
}

function acceptedQuest(kind: 'link' | 'git_commit' = 'link'): string {
  const outcome = run('ProposeQuest', { type: 'side', title: 'ship it', criteria: [{ kind, minCount: 1, description: 'one' }], xp: 120 })
  if (outcome.type !== 'ProposeQuest') throw new Error('unexpected')
  run('AcceptQuest', { questId: outcome.quest.id })
  return outcome.quest.id
}

function grantGithub(): string {
  const outcome = run('GrantConsent', { source: 'github_repo', scopeRef: 'https://github.com/Kylin/App', author: 'kylin' })
  if (outcome.type !== 'GrantConsent') throw new Error('unexpected')
  return outcome.consent.id
}

describe('GitHub source and link corroboration', () => {
  it('normalizes the grant and validates the author per source', () => {
    bind()
    expect(run('GrantConsent', { source: 'github_repo', scopeRef: 'Kylin/App', author: 'Kylin' })).toMatchObject({ consent: { scopeRef: 'kylin/app', author: 'kylin', source: 'github_repo' } })
    expect(attempt('GrantConsent', { source: 'github_repo', scopeRef: 'not a repo', author: 'kylin' })).toMatchObject({ ok: false, error: { code: 'command/invalid' } })
    expect(attempt('GrantConsent', { source: 'github_repo', scopeRef: 'a/b', author: 'not@login' })).toMatchObject({ ok: false, error: { code: 'command/invalid' } })
    // The same path string under another source is a different grant.
    expect(attempt('GrantConsent', { source: 'github_repo', scopeRef: 'kylin/app', author: 'kylin' })).toMatchObject({ ok: false, error: { code: 'consent/duplicate' } })
  })

  it('corroborates a merged PR link with the merge time, and refuses cross-source ingestion', () => {
    bind()
    const consent = grantGithub()
    const quest = acceptedQuest()
    at('2026-10-30T15:00:00.000Z')
    expect(app.ingestPullRequests(consent, [{ number: 42, title: 'feat: ship', mergedAt: '2026-10-30T14:00:00Z' }])).toEqual({ ok: true, value: { added: 1 } })
    expect(app.ingestCommits(consent, [{ sha: 'a'.repeat(40), committedAt: '2026-10-30T14:00:00Z', subject: 'x', filesChanged: 1 }]))
      .toMatchObject({ ok: false, error: { code: 'command/invalid' } })
    run('SubmitQuestEvidence', { questId: quest, evidence: [{ kind: 'link', ref: 'https://github.com/KYLIN/app/pull/42', observedAt: '2026-10-30T15:00:00Z' }] })
    expect(run('VerifyQuest', { questId: quest })).toMatchObject({ quest: { status: 'COMPLETED' } })
    const evidence = app.exportData().tables.evidence as Record<string, unknown>[]
    expect(evidence[0]).toMatchObject({ ref: 'https://github.com/KYLIN/app/pull/42', observed_at: '2026-10-30T14:00:00.000Z' })
    expect(evidence[0]!.corroborated_by).not.toBeNull()
  })

  it('does not corroborate unknown PRs, other repos, a PR merged before acceptance, or after revoke', () => {
    bind()
    const consent = grantGithub()
    app.ingestPullRequests(consent, [{ number: 1, title: 'old', mergedAt: '2026-10-29T00:00:00Z' }, { number: 2, title: 'new', mergedAt: '2026-10-30T13:00:00Z' }])
    const cases = [
      ['https://github.com/kylin/app/pull/99', 'unattested'],
      ['https://github.com/other/app/pull/2', 'unattested'],
      ['https://github.com/kylin/app/pull/1', 'before_acceptance'],
    ] as const
    at('2026-10-30T12:30:00.000Z')
    for (const [url, code] of cases) {
      const quest = acceptedQuest()
      run('SubmitQuestEvidence', { questId: quest, evidence: [{ kind: 'link', ref: url, observedAt: clock.now() }] })
      expect(run('VerifyQuest', { questId: quest })).toMatchObject({ quest: { status: 'NEEDS_EVIDENCE' }, verification: { reasons: [{ code }, { code: 'criterion_unmet' }] } })
    }
    run('RevokeConsent', { consentId: consent, deleteData: false })
    const quest = acceptedQuest()
    run('SubmitQuestEvidence', { questId: quest, evidence: [{ kind: 'link', ref: 'https://github.com/kylin/app/pull/2', observedAt: clock.now() }] })
    expect(run('VerifyQuest', { questId: quest })).toMatchObject({ quest: { status: 'NEEDS_EVIDENCE' } })
  })

  it('asks for PR links in system quests when only GitHub is consented', () => {
    bind()
    const consent = grantGithub()
    run('UpdatePreferences', { quietHours: null, systemProposalsPerDay: 1 })
    app.ingestPullRequests(consent, [3, 4, 5].map((n, i) => ({ number: n, title: `pr ${n}`, mergedAt: `2026-10-${26 + i * 2}T10:00:00Z` })))
    expect(app.tick().proposed).toBe(1)
    expect(app.dashboard().quests.find(item => item.type === 'hidden')!.criteria[0]).toMatchObject({ kind: 'link', minCount: 3 })
  })
})

describe('explicit time zone', () => {
  it('computes local days and day starts in the chosen zone', () => {
    expect(systemClock.localDay('2026-10-30T20:00:00Z', 'Asia/Shanghai')).toBe('2026-10-31')
    expect(systemClock.localDayStart('2026-10-30T20:00:00Z', 'Asia/Shanghai')).toBe('2026-10-30T16:00:00.000Z')
    expect(systemClock.localHour('2026-10-30T20:00:00Z', 'America/New_York')).toBe(16)
  })

  it('applies quiet hours in the Host zone, and keeps the zone when an update omits it', () => {
    bind()
    const consent = run('GrantConsent', { source: 'git_repo', scopeRef: '/repo/app', author: 'me@example.com' })
    if (consent.type !== 'GrantConsent') throw new Error('unexpected')
    app.ingestCommits(consent.consent.id, ['2026-10-26', '2026-10-28', '2026-10-30'].map((day, i) => ({ sha: `${i}`.repeat(40), committedAt: `${day}T09:00:00Z`, subject: 's', filesChanged: 1 })))
    at('2026-10-30T15:30:00.000Z') // 23:30 in Shanghai, 11:30 in New York
    run('UpdatePreferences', { quietHours: { start: 23, end: 8 }, systemProposalsPerDay: 1, timeZone: 'Asia/Shanghai' })
    expect(app.tick().proposed).toBe(0)
    run('UpdatePreferences', { quietHours: { start: 23, end: 8 }, systemProposalsPerDay: 1, timeZone: 'America/New_York' })
    run('UpdatePreferences', { quietHours: { start: 23, end: 8 }, systemProposalsPerDay: 1 })
    expect(app.dashboard().preferences).toMatchObject({ timeZone: 'America/New_York' })
    expect(app.tick().proposed).toBe(1)
    expect(attempt('UpdatePreferences', { quietHours: null, systemProposalsPerDay: 1, timeZone: 'Mars/Olympus' })).toMatchObject({ ok: false, error: { code: 'command/invalid' } })
  })
})

describe('agent review notes', () => {
  it('lets an agent read and annotate only quests the Host opened, without touching the verdict', () => {
    bind()
    const quest = acceptedQuest()
    run('SubmitQuestEvidence', { questId: quest, evidence: [{ kind: 'link', ref: 'https://example.com/report', summary: 'private detail', observedAt: clock.now() }] })
    run('VerifyQuest', { questId: quest })
    expect(app.reviewableSubmissions()).toEqual([])
    expect(app.annotateFromAgent('call-1', quest, '证据不足')).toMatchObject({ ok: false, error: { code: 'review/not-allowed' } })
    expect(attempt('AllowAgentReview', { questId: quest, allow: true }, 'agent')).toMatchObject({ ok: false, error: { code: 'command/forbidden' } })

    run('AllowAgentReview', { questId: quest, allow: true })
    expect(app.reviewableSubmissions()).toEqual([expect.objectContaining({ questId: quest, verdict: 'needs_evidence', evidence: [expect.objectContaining({ summary: 'private detail', attested: false })] })])
    expect(app.annotateFromAgent('call-1', quest, '  建议补一份可核对的 PR 链接。 ')).toMatchObject({ ok: true })
    expect(app.annotateFromAgent('call-1', quest, 'retry with different text')).toMatchObject({ ok: true })
    expect(app.annotateFromAgent('call-2', quest, 'x'.repeat(501))).toMatchObject({ ok: false, error: { code: 'command/invalid' } })
    const view = app.dashboard().quests.find(item => item.id === quest)!
    expect(view).toMatchObject({ agentReview: true, status: 'NEEDS_EVIDENCE', lastVerification: { verdict: 'needs_evidence' } })
    expect(view.reviewNotes.map(note => note.note)).toEqual(['建议补一份可核对的 PR 链接。'])
    app.tick()
    expect(app.dashboard().notices.filter(notice => notice.kind === 'review')).toHaveLength(1)

    run('AllowAgentReview', { questId: quest, allow: false })
    expect(app.reviewableSubmissions()).toEqual([])
    expect(app.annotateFromAgent('call-3', quest, 'later')).toMatchObject({ ok: false, error: { code: 'review/not-allowed' } })
  })
})

describe('restore from export', () => {
  function seed(): DataExport {
    bind()
    const quest = acceptedQuest()
    run('SubmitQuestEvidence', { questId: quest, evidence: [{ kind: 'link', ref: 'https://x', observedAt: clock.now(), attested: true }] })
    run('VerifyQuest', { questId: quest })
    run('SettleQuest', { questId: quest })
    run('AllowAgentReview', { questId: quest, allow: true })
    app.annotateFromAgent('call-1', quest, 'good')
    app.tick()
    return JSON.parse(JSON.stringify(app.exportData())) as DataExport
  }

  it('round-trips an export into an empty installation without re-dispatching history', () => {
    const exported = seed()
    const before = app.dashboard()
    const restored = open('restored')
    expect(restored.importData(exported)).toMatchObject({ ok: true })
    const after = restored.dashboard()
    expect(after.host).toEqual(before.host)
    expect(after.progress).toEqual(before.progress)
    expect(after.quests.map(quest => [quest.id, quest.status, quest.settled, quest.agentReview, quest.reviewNotes.length]))
      .toEqual(before.quests.map(quest => [quest.id, quest.status, quest.settled, quest.agentReview, quest.reviewNotes.length]))
    expect(after.notices.map(notice => notice.id)).toEqual(before.notices.map(notice => notice.id))
    restored.tick()
    expect(restored.dashboard().notices).toHaveLength(before.notices.length)
  })

  it('refuses non-empty installations, foreign documents, and unknown tables or columns, writing nothing', () => {
    const exported = seed()
    expect(app.importData(exported)).toMatchObject({ ok: false, error: { code: 'import/not-empty' } })
    const fresh = open('fresh')
    expect(fresh.importData({ format: 'other', formatVersion: 1, tables: {} })).toMatchObject({ ok: false, error: { code: 'import/invalid' } })
    expect(fresh.importData({ ...exported, tables: { ...exported.tables, secrets: [] } })).toMatchObject({ ok: false, error: { code: 'import/invalid' } })
    const tampered = { ...exported, tables: { ...exported.tables, quests: [{ ...(exported.tables.quests as object[])[0], injected: 1 }] } }
    expect(fresh.importData(tampered)).toMatchObject({ ok: false, error: { code: 'import/invalid' } })
    expect(fresh.importData({ ...exported, tables: {} })).toMatchObject({ ok: false, error: { code: 'import/invalid' } })
    const db = new DatabaseSync(join(dir, 'fresh'), { readOnly: true })
    expect(db.prepare('SELECT COUNT(*) AS n FROM hosts').get()).toEqual({ n: 0 })
    db.close()
  })
})
