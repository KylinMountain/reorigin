import type { SkillTier } from './growth.ts'
import { CHAPTERS } from './narrative.ts'
import type { QuestType } from './quest.ts'

/**
 * Badges and titles (docs/02 Reward). Each one is a deterministic rule over
 * verified facts; nothing here can be granted by a model or a story beat.
 * Unlocks are permanent and keyed, so re-evaluating never grants twice.
 *
 * Bump when the catalog's conditions change; stored with every unlock.
 */
export const ACHIEVEMENT_RULE_VERSION = 'achievement-v1'

/** A badge marks a moment; a title is a badge the Host may also display next to their name. */
export type AchievementKind = 'badge' | 'title'

export interface Unlock {
  /** Stable identity; the store keeps at most one unlock per Host and key. */
  readonly key: string
  readonly kind: AchievementKind
  readonly name: string
  readonly description: string
  /** The quest or skill that satisfied the rule, so the unlock can be traced. */
  readonly causeRef: string | null
}

export interface Achievement extends Unlock {
  readonly id: string
  readonly hostId: string
  readonly ruleVersion: string
  readonly grantedAt: string
}

export interface AchievementFacts {
  /** Verified completions, oldest first. */
  readonly completed: readonly {
    readonly questId: string
    readonly type: QuestType
    readonly completedAt: string
    /** Every piece of counted evidence was confirmed by an authorized source. */
    readonly corroborated: boolean
  }[]
  readonly level: number
  readonly skills: readonly { readonly skill: string, readonly tier: SkillTier }[]
  readonly localDay: (iso: string) => string
}

const CORROBORATED_TITLE_QUESTS = 5
const DAILY_DAYS = 7
const QUEST_MILESTONE = 10

/** Every unlock the facts currently satisfy. The caller stores the ones that are new. */
export function evaluateAchievements(facts: AchievementFacts): Unlock[] {
  const unlocks: Unlock[] = []
  const done = facts.completed
  const firstOf = (match: (quest: AchievementFacts['completed'][number]) => boolean) => done.find(match)?.questId

  const badge = (key: string, name: string, description: string, causeRef: string | undefined | null): void => {
    if (causeRef !== undefined) unlocks.push({ key, kind: 'badge', name, description, causeRef })
  }
  const title = (key: string, name: string, description: string, causeRef: string | null): void => {
    unlocks.push({ key, kind: 'title', name, description, causeRef })
  }

  badge('first_quest', '初次觉醒', '完成第一个经核验的任务', firstOf(() => true))
  badge('corroborated_quest', '证据为本', '第一次以授权来源佐证的证据完成任务', firstOf(quest => quest.corroborated))
  badge('hidden_quest', '隐藏发现', '完成一个隐藏任务', firstOf(quest => quest.type === 'hidden'))
  badge('breakthrough_quest', '破壁', '完成一个突破任务', firstOf(quest => quest.type === 'breakthrough'))
  if (done.length >= QUEST_MILESTONE) badge('quests_10', '十项实绩', `累计完成 ${QUEST_MILESTONE} 个经核验的任务`, done[QUEST_MILESTONE - 1]!.questId)

  const dailyDays: string[] = []
  for (const quest of done) {
    const day = facts.localDay(quest.completedAt)
    if (quest.type === 'daily' && !dailyDays.includes(day)) dailyDays.push(day)
    if (dailyDays.length === DAILY_DAYS) {
      badge('daily_7', '七日之约', `在 ${DAILY_DAYS} 个不同的日子完成日常任务`, quest.questId)
      break
    }
  }

  const corroborated = done.filter(quest => quest.corroborated)
  if (corroborated.length >= CORROBORATED_TITLE_QUESTS) {
    title('evidence_keeper', '证据主义者', `${CORROBORATED_TITLE_QUESTS} 个任务的证据全部由授权来源佐证`, corroborated[CORROBORATED_TITLE_QUESTS - 1]!.questId)
  }
  for (const chapter of CHAPTERS) {
    if (chapter.index > 1 && facts.level >= chapter.fromLevel) {
      title(`chapter_${chapter.index}`, `${chapter.title}者`, `进入第 ${chapter.index} 章「${chapter.title}」（Lv.${chapter.fromLevel}）`, null)
    }
  }
  for (const { skill, tier } of facts.skills) {
    if (tier >= 2) title(`skill:${skill}:practice`, `${skill}·实践者`, `「${skill}」的技能评估达到「实践」`, skill)
    if (tier >= 4) title(`skill:${skill}:advanced`, `${skill}·进阶者`, `「${skill}」的技能评估达到「进阶」`, skill)
  }
  return unlocks
}
