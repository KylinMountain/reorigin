import { describe, expect, it } from 'vitest'
import {
  levelForXp,
  proposeQuest,
  settleQuest,
  transition,
  verifyQuest,
  type Evidence,
  type Quest,
  type QuestStatus,
} from '../src/index.ts'

const T0 = '2026-10-30T10:00:00.000Z'
const T1 = '2026-10-30T11:00:00.000Z'
const T2 = '2026-10-30T12:00:00.000Z'

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    ...proposeQuest({
      id: 'q1',
      hostId: 'h1',
      type: 'side',
      source: 'host',
      title: 'Add a regression test',
      objective: '',
      criteria: [{ kind: 'git_commit', minCount: 1, description: 'one commit' }],
      reward: { ruleVersion: 'xp-v1', xp: 120 },
      at: T0,
    }),
    ...overrides,
  }
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'ev1',
    hostId: 'h1',
    kind: 'git_commit',
    ref: 'abc123',
    summary: '',
    observedAt: T2,
    recordedAt: T2,
    contentHash: 'sha256:abc',
    attested: false,
    ...overrides,
  }
}

function walk(start: Quest, path: readonly QuestStatus[]): Quest {
  return path.reduce((current, to) => transition(current, to, T1).quest, start)
}

describe('quest state machine', () => {
  it('walks the happy path and stamps accept/close times', () => {
    const done = walk(quest(), ['AVAILABLE', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'VERIFYING', 'COMPLETED'])
    expect(done).toMatchObject({ status: 'COMPLETED', revision: 6, acceptedAt: T1, closedAt: T1 })
  })

  it.each<[QuestStatus[], QuestStatus]>([
    [[], 'COMPLETED'],
    [['AVAILABLE'], 'SUBMITTED'],
    [['AVAILABLE', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED'], 'COMPLETED'],
    [['AVAILABLE', 'CANCELLED'], 'AVAILABLE'],
  ])('refuses an illegal jump after %j to %s', (path, to) => {
    expect(() => transition(walk(quest(), path), to, T1)).toThrow(expect.objectContaining({ code: 'quest/illegal-transition' }))
  })

  it('rejects a quest without criteria or with out-of-range XP', () => {
    expect(() => proposeQuest({ ...quest(), at: T0, criteria: [] })).toThrow(expect.objectContaining({ code: 'quest/invalid' }))
    expect(() => proposeQuest({ ...quest(), at: T0, reward: { ruleVersion: 'xp-v1', xp: 5000 } })).toThrow(expect.objectContaining({ code: 'quest/invalid' }))
  })
})

describe('deterministic verifier', () => {
  const accepted = walk(quest(), ['AVAILABLE', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'VERIFYING'])

  it('passes when every criterion has qualifying evidence', () => {
    expect(verifyQuest(accepted, [evidence()], new Set())).toMatchObject({ verdict: 'pass', acceptedEvidenceIds: ['ev1'] })
  })

  it('asks for more evidence when it predates acceptance, is reused, or is an unattested manual claim', () => {
    const cases = [
      evidence({ observedAt: T0 }),
      evidence({ contentHash: 'sha256:used' }),
    ]
    for (const item of cases) {
      expect(verifyQuest(accepted, [item], new Set(['sha256:used'])).verdict).toBe('needs_evidence')
    }
    const manualQuest = { ...accepted, criteria: [{ kind: 'manual' as const, minCount: 1, description: 'note' }] }
    expect(verifyQuest(manualQuest, [evidence({ kind: 'manual' })], new Set()).verdict).toBe('needs_evidence')
    expect(verifyQuest(manualQuest, [evidence({ kind: 'manual', attested: true })], new Set()).verdict).toBe('pass')
  })

  it('rejects evidence that belongs to another host', () => {
    expect(verifyQuest(accepted, [evidence(), evidence({ id: 'ev2', hostId: 'h2' })], new Set()).verdict).toBe('reject')
  })
})

describe('rewards', () => {
  it('only settles a completed quest, keyed by host + quest + rule + type', () => {
    expect(() => settleQuest(quest(), { id: 'r1', at: T1 })).toThrow(expect.objectContaining({ code: 'settlement/not-completed' }))
    const done = walk(quest(), ['AVAILABLE', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'VERIFYING', 'COMPLETED'])
    expect(settleQuest(done, { id: 'r1', at: T1 })).toMatchObject({ amount: 120, idempotencyKey: 'h1:q1:xp-v1:xp' })
  })

  it.each([[0, 1, 0], [99, 1, 99], [100, 2, 0], [299, 2, 199], [300, 3, 0], [600, 4, 0]])('xp %i is level %i (+%i)', (xp, level, intoLevel) => {
    expect(levelForXp(xp)).toMatchObject({ level, intoLevel })
  })
})
