import { describe, expect, it } from 'vitest'
import { assessSkill, evaluateAchievements, sameReading, type AchievementFacts, type SkillRecord } from '../src/index.ts'

const day = (n: number): string => new Date(Date.UTC(2026, 9, 1 + n, 10)).toISOString()
const localDay = (iso: string): string => iso.slice(0, 10)

function record(n: number, overrides: Partial<SkillRecord> = {}): SkillRecord {
  return { questId: `q${n}`, type: 'side', completedAt: day(n), evidence: [{ id: `e${n}`, corroborated: false }], ...overrides }
}

describe('skill assessment (assessment-v1)', () => {
  it('has nothing to say about an untagged or empty track', () => {
    expect(assessSkill('', [record(0)], localDay)).toBeNull()
    expect(assessSkill('  ', [record(0)], localDay)).toBeNull()
    expect(assessSkill('测试工程', [], localDay)).toBeNull()
  })

  it('needs repetition across days, not volume on one day, to move up a tier', () => {
    const sameDay = [0, 1, 2, 3].map(n => record(n, { completedAt: day(0) }))
    expect(assessSkill('测试工程', sameDay, localDay)).toMatchObject({ tier: 1, basis: { quests: 4, activeDays: 1, spanDays: 0 } })
    // Three days but within a week: still 起步.
    expect(assessSkill('测试工程', [record(0), record(1), record(2)], localDay)!.tier).toBe(1)
    expect(assessSkill('测试工程', [record(0), record(3), record(7)], localDay)).toMatchObject({ tier: 2, basis: { activeDays: 3, spanDays: 7 } })
  })

  it('reaches 稳定 over a month and 进阶 only with a breakthrough', () => {
    const month = [0, 6, 12, 18, 24, 30].map(n => record(n))
    expect(assessSkill('测试工程', month, localDay)!.tier).toBe(3)
    const withBreakthrough = [...month.slice(0, 5), record(30, { type: 'breakthrough' })]
    expect(assessSkill('测试工程', withBreakthrough, localDay)).toMatchObject({ tier: 4, basis: { breakthroughs: 1 } })
    // A breakthrough alone does not skip the steady requirement.
    expect(assessSkill('测试工程', [record(0, { type: 'breakthrough' })], localDay)!.tier).toBe(1)
  })

  it('keeps confidence low for self-reported evidence however much there is', () => {
    const selfReported = [0, 6, 12, 18, 24, 30].map(n => record(n))
    expect(assessSkill('写作', selfReported, localDay)!.confidence).toBe('low')
    const corroborated = (n: number) => record(n, { evidence: [{ id: `e${n}`, corroborated: true }] })
    expect(assessSkill('写作', [corroborated(0)], localDay)!.confidence).toBe('medium') // one quest is not enough for high
    expect(assessSkill('写作', [corroborated(0), corroborated(3), corroborated(7)], localDay)!.confidence).toBe('high')
    expect(assessSkill('写作', [corroborated(0), record(3), record(7)], localDay)!.confidence).toBe('medium')
  })

  it('keeps its basis traceable to quests and evidence', () => {
    const reading = assessSkill('测试工程', [record(0), record(1)], localDay)!
    expect(reading).toMatchObject({ ruleVersion: 'assessment-v1', questIds: ['q0', 'q1'], evidenceIds: ['e0', 'e1'] })
    expect(sameReading(reading, reading)).toBe(true)
    expect(sameReading(undefined, reading)).toBe(false)
    expect(sameReading(reading, assessSkill('测试工程', [record(0), record(1), record(2)], localDay)!)).toBe(false)
  })
})

describe('achievements (achievement-v1)', () => {
  const facts = (overrides: Partial<AchievementFacts> = {}): AchievementFacts => ({ completed: [], level: 1, skills: [], localDay, ...overrides })
  const keys = (input: Partial<AchievementFacts>) => evaluateAchievements(facts(input)).map(unlock => unlock.key)
  const done = (n: number, type: SkillRecord['type'] = 'side', corroborated = false) => ({ questId: `q${n}`, type, completedAt: day(n), corroborated })

  it('grants nothing before anything is verified', () => {
    expect(keys({})).toEqual([])
  })

  it('traces each badge to the quest that earned it', () => {
    const unlocks = evaluateAchievements(facts({ completed: [done(0), done(1, 'hidden'), done(2, 'side', true)] }))
    expect(unlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'first_quest', kind: 'badge', causeRef: 'q0' }),
      expect.objectContaining({ key: 'hidden_quest', causeRef: 'q1' }),
      expect.objectContaining({ key: 'corroborated_quest', causeRef: 'q2' }),
    ]))
    expect(unlocks.map(unlock => unlock.key)).not.toContain('breakthrough_quest')
  })

  it('counts daily quests by distinct day', () => {
    const sameDay = Array.from({ length: 7 }, (_, n) => ({ ...done(n, 'daily'), completedAt: day(0) }))
    expect(keys({ completed: sameDay })).not.toContain('daily_7')
    expect(keys({ completed: Array.from({ length: 7 }, (_, n) => done(n, 'daily')) })).toContain('daily_7')
  })

  it('derives titles from chapters, corroborated quests, and skill tiers', () => {
    expect(keys({ level: 5 })).toEqual(['chapter_2', 'chapter_3'])
    expect(keys({ completed: [0, 1, 2, 3, 4].map(n => done(n, 'side', true)) })).toContain('evidence_keeper')
    expect(keys({ skills: [{ skill: '测试工程', tier: 1 }] })).toEqual([])
    expect(keys({ skills: [{ skill: '测试工程', tier: 2 }] })).toEqual(['skill:测试工程:practice'])
    expect(keys({ skills: [{ skill: '测试工程', tier: 4 }] })).toEqual(['skill:测试工程:practice', 'skill:测试工程:advanced'])
  })
})
