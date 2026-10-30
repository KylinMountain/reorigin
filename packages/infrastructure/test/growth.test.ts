import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReOriginApp, type Clock, type CommandOutcome, type IdSource } from '@reorigin/application'
import { SqliteStore } from '../src/index.ts'

/** Growth Engine and achievements on a real SQLite file: evidence in, assessments and unlocks out, XP untouched. */

let dir: string
let path: string
let stores: SqliteStore[]
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

function open(): ReOriginApp {
  const store = new SqliteStore(path)
  stores.push(store)
  return new ReOriginApp({ store, clock, ids })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reorigin-growth-'))
  path = join(dir, 'db')
  stores = []
  counter = 0
  seq = 0
  nowMs = Date.parse('2026-10-01T12:00:00.000Z')
  app = open()
  const bound = run('BindHost', { displayName: 'K', goals: ['工程成长'] })
  if (bound.type === 'BindHost') hostId = bound.host.id
})

afterEach(() => {
  for (const store of stores) store.close()
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

const sha = (n: number): string => `${String(n).padStart(2, '0')}${'cd'.repeat(19)}`

/** Complete and settle one quest; with a consent, the commit is corroborated by the collected repository. */
function complete(n: number, options: { skill?: string, type?: string, consentId?: string } = {}): string {
  const proposed = run('ProposeQuest', {
    type: options.type ?? 'side', title: `q${n}`, skill: options.skill ?? '测试工程', xp: 50,
    criteria: [{ kind: 'git_commit', minCount: 1, description: 'c' }],
  })
  if (proposed.type !== 'ProposeQuest') throw new Error('unexpected')
  const questId = proposed.quest.id
  run('AcceptQuest', { questId })
  nowMs += 60_000
  if (options.consentId !== undefined) {
    app.ingestCommits(options.consentId, [{ sha: sha(n), committedAt: clock.now(), subject: `commit ${n}`, filesChanged: 1 }])
  }
  run('SubmitQuestEvidence', { questId, evidence: [{ kind: 'git_commit', ref: options.consentId === undefined ? `self-${n}` : sha(n).slice(0, 10), observedAt: clock.now(), attested: true }] })
  run('VerifyQuest', { questId })
  run('SettleQuest', { questId })
  app.tick()
  return questId
}

describe('Growth Engine on SQLite', () => {
  it('assesses a growth tag from verified completions and records each change once', () => {
    complete(1)
    let dashboard = app.dashboard()
    expect(dashboard.skills).toEqual([expect.objectContaining({ skill: '测试工程', tier: 1, confidence: 'low', ruleVersion: 'assessment-v1', basis: expect.objectContaining({ quests: 1, corroborated: 0 }) })])
    const xpBefore = dashboard.progress.xp
    // Nothing new to read: ticking again stores nothing and does not touch XP.
    expect(app.tick()).toMatchObject({ assessed: 0, unlocked: 0 })
    expect(app.dashboard().progress.xp).toBe(xpBefore)

    nowMs += 3 * DAY
    complete(2)
    nowMs += 4 * DAY
    complete(3)
    dashboard = app.dashboard()
    expect(dashboard.skills[0]).toMatchObject({ tier: 2, basis: { quests: 3, activeDays: 3, spanDays: 7 } })
    expect(dashboard.skills[0]!.questIds).toHaveLength(3)
    // The tier change surfaced as a message; the same-tier re-reading for quest 2 did not.
    expect(dashboard.notices.filter(notice => notice.kind === 'skill').map(notice => notice.title)).toEqual(['【技能评估】测试工程 · 实践', '【技能评估】测试工程 · 起步'])
    const rows = Number((new DatabaseSync(path).prepare('SELECT COUNT(*) AS n FROM skill_assessments').get() as { n: number }).n)
    expect(rows).toBe(3)
  })

  it('raises confidence only for evidence an authorized source corroborates', () => {
    const consent = run('GrantConsent', { source: 'git_repo', scopeRef: '/repo/app', authorEmail: 'me@example.com' })
    if (consent.type !== 'GrantConsent') throw new Error('unexpected')
    for (const n of [1, 2, 3]) {
      complete(n, { skill: '后端', consentId: consent.consent.id })
      nowMs += 4 * DAY
    }
    complete(4, { skill: '写作' })
    const skills = app.dashboard().skills
    expect(skills.find(item => item.skill === '后端')).toMatchObject({ tier: 2, confidence: 'high', basis: { corroborated: 3, evidence: 3 } })
    expect(skills.find(item => item.skill === '写作')).toMatchObject({ tier: 1, confidence: 'low' })
    expect(app.dashboard().achievements.map(item => item.key)).toEqual(expect.arrayContaining(['corroborated_quest', 'skill:后端:practice']))
  })

  it('skips untagged quests', () => {
    complete(1, { skill: '' })
    expect(app.dashboard().skills).toEqual([])
    expect(app.dashboard().growth).toEqual([expect.objectContaining({ skill: '未分类' })])
  })
})

describe('achievements and titles on SQLite', () => {
  it('unlocks each achievement once and survives a restart', () => {
    complete(1, { type: 'breakthrough' })
    complete(2)
    const keys = app.dashboard().achievements.map(item => item.key)
    expect(keys).toEqual(['first_quest', 'breakthrough_quest'])
    expect(app.dashboard().achievements[0]).toMatchObject({ causeRef: expect.stringMatching(/^quest_/), ruleVersion: 'achievement-v1' })
    expect(app.tick().unlocked).toBe(0)
    expect(app.dashboard().notices.filter(notice => notice.kind === 'achievement').map(notice => notice.title)).toEqual(['【成就解锁】破壁', '【成就解锁】初次觉醒'])
    expect(open().dashboard().achievements.map(item => item.key)).toEqual(keys)
  })

  it('lets the Host display only an unlocked title, and never lets an agent choose', () => {
    expect(attempt('EquipTitle', { titleKey: 'chapter_2' })).toMatchObject({ ok: false, error: { code: 'title/locked' } })
    // 300 XP reaches Lv.3, chapter 2.
    for (const n of [1, 2, 3, 4, 5, 6]) complete(n)
    expect(app.dashboard().achievements.find(item => item.key === 'chapter_2')).toMatchObject({ kind: 'title', name: '立足者' })
    // A badge is not a title.
    expect(attempt('EquipTitle', { titleKey: 'first_quest' })).toMatchObject({ ok: false, error: { code: 'title/locked' } })
    expect(attempt('EquipTitle', { titleKey: 'chapter_2' }, 'agent')).toMatchObject({ ok: false, error: { code: 'command/forbidden' } })

    run('EquipTitle', { titleKey: 'chapter_2' })
    expect(app.dashboard().title).toMatchObject({ name: '立足者' })
    expect(app.agentBrief()).toMatchObject({ title: '立足者', skills: [{ skill: '测试工程', tier: '起步', confidence: '低', quests: 6 }] })
    run('EquipTitle', { titleKey: null })
    expect(app.dashboard().title).toBeNull()
  })

  it('keeps assessments and achievements append-only', () => {
    complete(1)
    const db = new DatabaseSync(path)
    expect(() => db.exec("UPDATE skill_assessments SET tier = 4")).toThrow(/append-only/)
    expect(() => db.exec('DELETE FROM skill_assessments')).toThrow(/append-only/)
    expect(() => db.exec("UPDATE achievements SET name = 'x'")).toThrow(/append-only/)
    expect(() => db.exec('DELETE FROM achievements')).toThrow(/append-only/)
    db.close()
  })
})
