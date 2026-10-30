import type { QuestType } from './quest.ts'

/**
 * Growth Engine (docs/02 Growth, ADR-003). A skill assessment is a
 * deterministic reading of verified completions under one growth tag: it keeps
 * its basis, states its confidence, and never feeds XP. It describes what the
 * System has seen, not what the Host can do outside it.
 *
 * Bump when the tiers or confidence rules below change; stored with every assessment.
 */
export const ASSESSMENT_RULE_VERSION = 'assessment-v1'

export type SkillTier = 1 | 2 | 3 | 4
export type Confidence = 'low' | 'medium' | 'high'

/** What each tier requires. Tiers only ever read verified completions, so they cannot be talked into existence. */
export const SKILL_TIERS: readonly { readonly tier: SkillTier, readonly label: string, readonly requirement: string }[] = [
  { tier: 1, label: '起步', requirement: '至少 1 个经核验完成的任务' },
  { tier: 2, label: '实践', requirement: '至少 3 个任务，分布在 3 个不同日子，时间跨度 ≥ 7 天' },
  { tier: 3, label: '稳定', requirement: '至少 6 个任务，分布在 6 个不同日子，时间跨度 ≥ 30 天' },
  { tier: 4, label: '进阶', requirement: '达到「稳定」，且完成过该标签下的突破任务' },
]

export const CONFIDENCE_LABEL: Record<Confidence, string> = { low: '低', medium: '中', high: '高' }

export function tierLabel(tier: SkillTier): string {
  return SKILL_TIERS[tier - 1]!.label
}

/** One verified completion and the evidence the verifier counted for it. */
export interface SkillRecord {
  readonly questId: string
  readonly type: QuestType
  readonly completedAt: string
  readonly evidence: readonly { readonly id: string, readonly corroborated: boolean }[]
}

/** The facts an assessment rests on; shown to the Host so the reading can be checked. */
export interface SkillBasis {
  readonly quests: number
  readonly activeDays: number
  readonly spanDays: number
  readonly evidence: number
  /** Evidence confirmed by an authorized source rather than the Host's word. */
  readonly corroborated: number
  readonly breakthroughs: number
}

export interface SkillReading {
  readonly skill: string
  readonly tier: SkillTier
  readonly confidence: Confidence
  readonly ruleVersion: string
  readonly basis: SkillBasis
  readonly questIds: readonly string[]
  readonly evidenceIds: readonly string[]
}

export interface SkillAssessment extends SkillReading {
  readonly id: string
  readonly hostId: string
  readonly assessedAt: string
}

const DAY = 86_400_000

/**
 * Read one growth tag. Returns null for an untagged or empty track: there is
 * nothing to assess, and "未分类" is not a skill.
 */
export function assessSkill(skill: string, records: readonly SkillRecord[], localDay: (iso: string) => string): SkillReading | null {
  const name = skill.trim()
  if (name === '' || records.length === 0) return null
  const times = records.map(record => Date.parse(record.completedAt)).sort((a, b) => a - b)
  const evidence = records.flatMap(record => record.evidence)
  const basis: SkillBasis = {
    quests: records.length,
    activeDays: new Set(records.map(record => localDay(record.completedAt))).size,
    spanDays: Math.floor((times[times.length - 1]! - times[0]!) / DAY),
    evidence: evidence.length,
    corroborated: evidence.filter(item => item.corroborated).length,
    breakthroughs: records.filter(record => record.type === 'breakthrough').length,
  }
  return {
    skill: name,
    tier: tierFor(basis),
    confidence: confidenceFor(basis),
    ruleVersion: ASSESSMENT_RULE_VERSION,
    basis,
    questIds: records.map(record => record.questId),
    evidenceIds: evidence.map(item => item.id),
  }
}

function tierFor(basis: SkillBasis): SkillTier {
  const steady = basis.quests >= 6 && basis.activeDays >= 6 && basis.spanDays >= 30
  if (steady && basis.breakthroughs > 0) return 4
  if (steady) return 3
  if (basis.quests >= 3 && basis.activeDays >= 3 && basis.spanDays >= 7) return 2
  return 1
}

/** Mostly self-reported evidence stays low however much of it there is; high also needs repetition. */
function confidenceFor(basis: SkillBasis): Confidence {
  const ratio = basis.evidence === 0 ? 0 : basis.corroborated / basis.evidence
  if (basis.quests >= 3 && ratio >= 0.6) return 'high'
  if (ratio >= 0.3) return 'medium'
  return 'low'
}

/** Whether a fresh reading says anything the stored one does not; an unchanged reading is not stored again. */
export function sameReading(stored: SkillReading | undefined, next: SkillReading): boolean {
  return stored !== undefined
    && stored.tier === next.tier
    && stored.confidence === next.confidence
    && stored.ruleVersion === next.ruleVersion
    && stored.basis.quests === next.basis.quests
    && stored.basis.evidence === next.basis.evidence
    && stored.basis.corroborated === next.basis.corroborated
}
