import { DomainError } from './errors.ts'
import type { Quest } from './quest.ts'

export type RewardType = 'xp'

export interface LedgerEntry {
  readonly id: string
  readonly hostId: string
  readonly questId: string
  readonly rewardType: RewardType
  readonly amount: number
  readonly ruleVersion: string
  /** host + quest + rule version + reward type (docs/05); the store enforces uniqueness on it. */
  readonly idempotencyKey: string
  readonly grantedAt: string
}

export function settlementKey(hostId: string, questId: string, ruleVersion: string, rewardType: RewardType): string {
  return [hostId, questId, ruleVersion, rewardType].join(':')
}

/** Build the XP grant for a completed quest. Persisting it twice is the store's job to refuse. */
export function settleQuest(quest: Quest, input: { id: string, at: string }): LedgerEntry {
  if (quest.status !== 'COMPLETED') {
    throw new DomainError('settlement/not-completed', `quest ${quest.id} is ${quest.status}, not COMPLETED`)
  }
  return {
    id: input.id,
    hostId: quest.hostId,
    questId: quest.id,
    rewardType: 'xp',
    amount: quest.reward.xp,
    ruleVersion: quest.reward.ruleVersion,
    idempotencyKey: settlementKey(quest.hostId, quest.id, quest.reward.ruleVersion, 'xp'),
    grantedAt: input.at,
  }
}

export interface LevelProgress {
  readonly level: number
  readonly xp: number
  /** XP earned since reaching the current level. */
  readonly intoLevel: number
  /** XP the current level spans; reaching it levels up. */
  readonly levelSpan: number
}

/** Level n starts at 50·n·(n−1) XP: 0, 100, 300, 600, 1000 … */
export function levelForXp(xp: number): LevelProgress {
  let level = 1
  while (50 * (level + 1) * level <= xp) level += 1
  const start = 50 * level * (level - 1)
  return { level, xp, intoLevel: xp - start, levelSpan: 100 * level }
}
