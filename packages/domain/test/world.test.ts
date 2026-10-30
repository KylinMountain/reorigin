import { describe, expect, it } from 'vitest'
import { chapterFor, detectOpportunities, expiryTarget, filterCommit, inQuietHours, proposeQuest, transition, type WorldEvent } from '../src/index.ts'

const NOW = '2026-10-30T12:00:00.000Z'
const localDay = (iso: string): string => iso.slice(0, 10)

function commitOn(day: string, id = day): WorldEvent {
  return { id, hostId: 'h1', consentId: 'c1', source: 'git_repo', externalId: `abcdef${id.replaceAll('-', '')}`, observedAt: `${day}T09:00:00.000Z`, summary: 'work', filesChanged: 1 }
}

describe('world rules', () => {
  it('proposes a streak quest after three active days in a week, keyed by the latest day', () => {
    const { proposals } = detectOpportunities({ now: NOW, events: ['2026-10-26', '2026-10-28', '2026-10-30'].map(day => commitOn(day)), hasGoals: true, localDay })
    expect(proposals).toEqual([expect.objectContaining({ sourceKey: 'world-v1:streak:2026-10-30', minCommits: 3 })])
  })

  it('ignores two active days, events older than a week, and events from the future', () => {
    const events = [commitOn('2026-10-29'), commitOn('2026-10-30'), commitOn('2026-10-01'), commitOn('2026-11-02')]
    expect(detectOpportunities({ now: NOW, events, hasGoals: true, localDay }).proposals).toEqual([])
  })

  it('nudges once per day after three idle days, and only when the Host has goals', () => {
    const idle = [commitOn('2026-10-25')]
    expect(detectOpportunities({ now: NOW, events: idle, hasGoals: true, localDay }).nudges).toEqual([expect.objectContaining({ sourceKey: 'world-v1:idle:2026-10-30' })])
    expect(detectOpportunities({ now: NOW, events: idle, hasGoals: false, localDay }).nudges).toEqual([])
    expect(detectOpportunities({ now: NOW, events: [commitOn('2026-10-29')], hasGoals: true, localDay }).nudges).toEqual([])
  })

  it('treats quiet hours that wrap midnight correctly', () => {
    const preferences = { quietHours: { start: 23, end: 8 }, systemProposalsPerDay: 1 }
    expect([23, 0, 7].map(hour => inQuietHours(hour, preferences))).toEqual([true, true, true])
    expect([8, 12, 22].map(hour => inQuietHours(hour, preferences))).toEqual([false, false, false])
    expect(inQuietHours(3, { ...preferences, quietHours: null })).toBe(false)
  })

  it('keeps only the privacy projection of a commit', () => {
    const filtered = filterCommit({ sha: 'a'.repeat(40), committedAt: '2026-10-30T10:00:00+08:00', subject: `fix:  ${'x'.repeat(200)}`, filesChanged: 3 })
    expect(filtered.observedAt).toBe('2026-10-30T02:00:00.000Z')
    expect(filtered.summary.length).toBe(120)
    expect(Object.keys(filtered).sort()).toEqual(['externalId', 'filesChanged', 'observedAt', 'summary'])
    expect(() => filterCommit({ sha: 'not-a-sha', committedAt: NOW, subject: '', filesChanged: 0 })).toThrow(expect.objectContaining({ code: 'world/invalid' }))
  })
})

describe('deadlines and chapters', () => {
  const base = proposeQuest({
    id: 'q', hostId: 'h1', type: 'daily', source: 'host', title: 't', objective: '',
    criteria: [{ kind: 'manual', minCount: 1, description: 'd' }], reward: { ruleVersion: 'xp-v1', xp: 10 }, at: '2026-10-29T00:00:00.000Z',
    expiresAt: '2026-10-30T00:00:00.000Z',
  })

  it('expires unstarted work but never a quest the Host already submitted', () => {
    expect(expiryTarget(base, NOW)).toBe('CANCELLED') // still PROPOSED
    const available = transition(base, 'AVAILABLE', NOW).quest
    expect(expiryTarget(available, NOW)).toBe('EXPIRED')
    expect(expiryTarget(available, '2026-10-29T12:00:00.000Z')).toBeNull()
    const submitted = ['ACCEPTED', 'IN_PROGRESS', 'SUBMITTED'].reduce((quest, to) => transition(quest, to as never, NOW).quest, available)
    expect(expiryTarget(submitted, NOW)).toBeNull()
  })

  it('maps levels to chapters', () => {
    expect([1, 2, 3, 5, 9].map(level => chapterFor(level).index)).toEqual([1, 1, 2, 3, 4])
  })
})
