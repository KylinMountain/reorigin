import type { QuestView } from '@reorigin/application'
import type { EvidenceKind, QuestStatus, QuestType, VerificationReason } from '@reorigin/domain'
import type { ReOriginClient } from './api.ts'

export const STATUS: Record<QuestStatus, { label: string, tone: string }> = {
  PROPOSED: { label: '待审阅', tone: 'accent' },
  AVAILABLE: { label: '可接取', tone: 'accent' },
  ACCEPTED: { label: '已接受', tone: 'warn' },
  IN_PROGRESS: { label: '进行中', tone: 'warn' },
  PAUSED: { label: '已暂停', tone: 'muted' },
  SUBMITTED: { label: '已提交', tone: 'warn' },
  VERIFYING: { label: '核验中', tone: 'warn' },
  NEEDS_EVIDENCE: { label: '需补证', tone: 'err' },
  COMPLETED: { label: '已完成', tone: 'ok' },
  REJECTED: { label: '已驳回', tone: 'err' },
  CANCELLED: { label: '已放弃', tone: 'muted' },
  EXPIRED: { label: '已过期', tone: 'muted' },
}

export const QUEST_TYPE: Record<QuestType, string> = { main: '主线', side: '支线', daily: '日常', hidden: '隐藏', breakthrough: '突破' }
export const EVIDENCE_KIND: Record<EvidenceKind, string> = { manual: '亲述', link: '链接', git_commit: 'Git 提交' }
export const SOURCE: Record<QuestView['source'], string> = { host: '宿主自定', agent: 'Agent 建议', system: '系统发现' }

/** Word a verifier reason for the Host. Rows written before reasons were structured still hold plain strings. */
export function describeReason(reason: VerificationReason | string): string {
  if (typeof reason === 'string') return reason
  switch (reason.code) {
    case 'other_host': return '有证据不属于当前宿主，任务已驳回'
    case 'before_acceptance': return '有证据的发生时间早于接受任务，不计入'
    case 'reused': return '有证据已经计入过其他任务，不能重复使用'
    case 'unattested': return '有证据既没有来自已授权数据源的佐证，也没有勾选「我确认属实」'
    case 'criterion_unmet': return `「${reason.description}」：已有 ${reason.count} / 需要 ${reason.required}`
  }
}

/** Audit event types in the Host's words. */
export const EVENT_LABEL: Record<string, string> = {
  'host.bound.v1': '绑定宿主',
  'quest.proposed.v1': '提出任务',
  'quest.transitioned.v1': '任务状态变化',
  'quest.accepted.v1': '接受任务',
  'quest.paused.v1': '暂停任务',
  'quest.resumed.v1': '恢复任务',
  'quest.evidence_submitted.v1': '提交证据',
  'quest.verified.v1': '核验',
  'quest.completed.v1': '任务完成',
  'reward.granted.v1': 'XP 入账',
  'consent.granted.v1': '授权数据源',
  'consent.revoked.v1': '撤销授权',
  'world.event_observed.v1': '采集数据源',
  'preferences.updated.v1': '更新系统设置',
  'memory.added.v1': '添加记忆',
  'memory.forgotten.v1': '忘记记忆',
  'system.nudged.v1': '系统提醒',
  'skill.assessed.v1': '技能评估',
  'achievement.unlocked.v1': '解锁成就',
  'host.title_equipped.v1': '佩戴称号',
}

/** Who caused an audit event, read from its causation id. */
export function eventActor(causationId: string): string {
  if (causationId.startsWith('system:')) return '系统'
  if (causationId.startsWith('agent:')) return 'Agent'
  return '宿主'
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Date.parse(iso) - now
  const abs = Math.abs(diff)
  const unit = abs >= 86_400_000 ? [86_400_000, '天'] as const : abs >= 3_600_000 ? [3_600_000, '小时'] as const : [60_000, '分钟'] as const
  const value = Math.max(1, Math.round(abs / unit[0]))
  return diff >= 0 ? `${value} ${unit[1]}后` : `${value} ${unit[1]}前`
}

export type Run = (work: () => Promise<unknown>, notice?: string) => Promise<void>

export interface Ctx {
  readonly run: Run
  readonly busy: boolean
  readonly client: ReOriginClient
  readonly hostId: string
}
