import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Dashboard, QuestView } from '@reorigin/application'
import type { EvidenceKind, QuestStatus, QuestType } from '@reorigin/domain'
import { RemoteFailure, type ReOriginClient } from './api.ts'

const STATUS: Record<QuestStatus, { label: string, tone: string }> = {
  PROPOSED: { label: '待审阅', tone: 'accent' },
  AVAILABLE: { label: '可接取', tone: 'accent' },
  ACCEPTED: { label: '已接受', tone: 'warn' },
  IN_PROGRESS: { label: '进行中', tone: 'warn' },
  SUBMITTED: { label: '已提交', tone: 'warn' },
  VERIFYING: { label: '核验中', tone: 'warn' },
  NEEDS_EVIDENCE: { label: '需补证', tone: 'err' },
  COMPLETED: { label: '已完成', tone: 'ok' },
  REJECTED: { label: '已驳回', tone: 'err' },
  CANCELLED: { label: '已放弃', tone: 'muted' },
  EXPIRED: { label: '已过期', tone: 'muted' },
}

const QUEST_TYPE: Record<QuestType, string> = { main: '主线', side: '支线', daily: '日常', hidden: '隐藏', breakthrough: '突破' }
const EVIDENCE_KIND: Record<EvidenceKind, string> = { manual: '亲述（需确认属实）', link: '链接', git_commit: 'Git 提交' }

type Run = (work: () => Promise<unknown>, notice?: string) => Promise<void>

export function SystemPanel({ client }: { client: ReOriginClient }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => setDashboard(await client.dashboard()), [client])
  const run: Run = useCallback(async (work, message) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await work()
      if (message !== undefined) setNotice(message)
    } catch (failure) {
      setError(failure instanceof RemoteFailure ? `${failure.code}：${failure.message}` : String(failure))
    } finally {
      await reload().catch(() => {})
      setBusy(false)
    }
  }, [reload])

  useEffect(() => { reload().catch(failure => setError(String(failure))) }, [reload])

  return (
    <div className="ro-root" data-testid="reorigin-panel">
      <div className="ro-wrap">
        <div>
          <div className="ro-kicker">Re:Origin · System Terminal</div>
          <h1 className="ro-title">{dashboard?.host ? '【系统运行中】' : '【系统已觉醒】'}</h1>
          <p className="ro-sub">{dashboard?.host
            ? `宿主 ${dashboard.host.displayName}，今天也请在现实中前进一步。`
            : '检测到符合条件的宿主。人生没有读档键，但可以从这一刻重新开始。'}</p>
        </div>
        {error !== null && <div className="ro-card ro-error" role="alert">{error}</div>}
        {notice !== null && <div className="ro-card ro-toast" role="status">{notice}</div>}
        {dashboard === null
          ? <div className="ro-muted">连接系统核心…</div>
          : dashboard.host === null
            ? <BindForm run={run} busy={busy} client={client} />
            : <HostView dashboard={dashboard} run={run} busy={busy} client={client} hostId={dashboard.host.id} />}
      </div>
    </div>
  )
}

function BindForm({ run, busy, client }: { run: Run, busy: boolean, client: ReOriginClient }) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(() => client.execute('BindHost', { displayName: name, goals: goal.trim() ? [goal] : [] }), '宿主绑定完成。系统将与你一同成长。')
  }
  return (
    <form className="ro-card ro-form" onSubmit={submit}>
      <p className="ro-section-title">宿主绑定</p>
      <label>宿主称呼<input className="ro-input" value={name} onChange={e => setName(e.target.value)} maxLength={40} required /></label>
      <label>当前主线目标（可选）<input className="ro-input" value={goal} onChange={e => setGoal(e.target.value)} maxLength={200} placeholder="例如：成为能独立交付的工程师" /></label>
      <div><button className="ro-btn" data-primary type="submit" disabled={busy || name.trim() === ''}>绑定宿主</button></div>
    </form>
  )
}

interface HostProps { dashboard: Dashboard, run: Run, busy: boolean, client: ReOriginClient, hostId: string }

function HostView({ dashboard, run, busy, client, hostId }: HostProps) {
  const { host, progress, quests } = dashboard
  const active = quests.filter(quest => !['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(quest.status) || (quest.status === 'COMPLETED' && !quest.settled))
  const closed = quests.filter(quest => !active.includes(quest))
  return (
    <>
      <div className="ro-card">
        <div className="ro-row ro-spread">
          <div className="ro-row">
            <span className="ro-level">Lv.{progress.level}</span>
            <span className="ro-muted ro-mono">XP {progress.xp}</span>
          </div>
          <span className="ro-muted">{host!.goals.length > 0 ? `主线目标：${host!.goals.join('；')}` : '尚未设定主线目标'}</span>
        </div>
        <div className="ro-row" style={{ marginTop: 10 }}>
          <div className="ro-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.levelSpan} aria-valuenow={progress.intoLevel}>
            <span style={{ width: `${Math.min(100, (progress.intoLevel / progress.levelSpan) * 100)}%` }} />
          </div>
          <span className="ro-muted ro-mono">{progress.intoLevel}/{progress.levelSpan}</span>
        </div>
        <p className="ro-muted" style={{ margin: '8px 0 0' }}>XP 只代表系统内的成长反馈，不等于现实能力评估。</p>
      </div>

      <NewQuestForm run={run} busy={busy} client={client} hostId={hostId} />

      <p className="ro-section-title">进行中的任务（{active.length}）</p>
      {active.length === 0 && <div className="ro-muted">暂无任务。发布一条与你主线目标相关的现实任务吧。</div>}
      {active.map(quest => <QuestCard key={quest.id} quest={quest} run={run} busy={busy} client={client} hostId={hostId} />)}

      {closed.length > 0 && <p className="ro-section-title">历史（{closed.length}）</p>}
      {closed.map(quest => <QuestCard key={quest.id} quest={quest} run={run} busy={busy} client={client} hostId={hostId} />)}
    </>
  )
}

function NewQuestForm({ run, busy, client, hostId }: Omit<HostProps, 'dashboard'>) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [type, setType] = useState<QuestType>('side')
  const [kind, setKind] = useState<EvidenceKind>('git_commit')
  const [count, setCount] = useState(1)
  const [xp, setXp] = useState(100)
  if (!open) return <div><button className="ro-btn" onClick={() => setOpen(true)}>＋ 发布新任务</button></div>
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await client.execute('ProposeQuest', {
        type, title, objective, xp,
        criteria: [{ kind, minCount: count, description: `${count} 份${EVIDENCE_KIND[kind]}证据` }],
      }, hostId)
      setOpen(false)
      setTitle('')
      setObjective('')
    }, '任务已发布。')
  }
  return (
    <form className="ro-card ro-form" onSubmit={submit}>
      <p className="ro-section-title">发布任务</p>
      <label>任务名<input className="ro-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required /></label>
      <label>目标说明<input className="ro-input" value={objective} onChange={e => setObjective(e.target.value)} maxLength={1000} /></label>
      <div className="ro-grid2">
        <label>类型<select className="ro-input" value={type} onChange={e => setType(e.target.value as QuestType)}>
          {Object.entries(QUEST_TYPE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>验收证据<select className="ro-input" value={kind} onChange={e => setKind(e.target.value as EvidenceKind)}>
          {Object.entries(EVIDENCE_KIND).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>证据数量<input className="ro-input" type="number" min={1} max={20} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
        <label>奖励 XP<input className="ro-input" type="number" min={0} max={1000} value={xp} onChange={e => setXp(Number(e.target.value))} /></label>
      </div>
      <div className="ro-row">
        <button className="ro-btn" data-primary type="submit" disabled={busy || title.trim() === ''}>发布</button>
        <button className="ro-btn" type="button" onClick={() => setOpen(false)}>取消</button>
      </div>
    </form>
  )
}

function QuestCard({ quest, run, busy, client, hostId }: { quest: QuestView } & Omit<HostProps, 'dashboard'>) {
  const status = STATUS[quest.status]
  const act = (type: 'AcceptQuest' | 'CancelQuest' | 'VerifyQuest' | 'SettleQuest', message: string) =>
    () => void run(() => client.execute(type, { questId: quest.id }, hostId), message)
  const canSubmit = ['ACCEPTED', 'IN_PROGRESS', 'NEEDS_EVIDENCE'].includes(quest.status)
  const verification = quest.lastVerification
  let actions: ReactNode = null
  if (quest.status === 'PROPOSED' || quest.status === 'AVAILABLE') {
    actions = <>
      <button className="ro-btn" data-primary disabled={busy} onClick={act('AcceptQuest', '任务已接受。')}>接受任务</button>
      <button className="ro-btn" disabled={busy} onClick={act('CancelQuest', '已放弃该任务。')}>放弃</button>
    </>
  } else if (quest.status === 'SUBMITTED') {
    actions = <button className="ro-btn" data-primary disabled={busy} onClick={act('VerifyQuest', '核验完成。')}>开始核验</button>
  } else if (quest.status === 'COMPLETED' && !quest.settled) {
    actions = <button className="ro-btn" data-primary disabled={busy} onClick={act('SettleQuest', `结算完成：+${quest.reward.xp} XP`)}>领取奖励 +{quest.reward.xp} XP</button>
  } else if (quest.status === 'ACCEPTED' || quest.status === 'IN_PROGRESS') {
    actions = <button className="ro-btn" disabled={busy} onClick={act('CancelQuest', '已放弃该任务。')}>放弃</button>
  }
  return (
    <div className="ro-card" data-testid={`quest-${quest.status}`}>
      <div className="ro-row ro-spread">
        <div className="ro-row">
          <span className="ro-badge" data-tone={status.tone}>{status.label}</span>
          <span className="ro-quest-title">【{QUEST_TYPE[quest.type]}任务：{quest.title}】</span>
        </div>
        <span className="ro-muted ro-mono">{quest.settled ? `已结算 +${quest.reward.xp} XP` : `奖励 ${quest.reward.xp} XP`}</span>
      </div>
      {quest.objective !== '' && <p style={{ margin: '8px 0 0' }}>{quest.objective}</p>}
      <ul className="ro-list">
        {quest.criteria.map(criterion => <li key={criterion.description}>验收：{criterion.description}</li>)}
      </ul>
      <p className="ro-muted" style={{ margin: '6px 0 0' }}>
        来源：{quest.source === 'host' ? '宿主自定' : quest.source === 'agent' ? 'Agent 建议' : '系统'} · 已提交证据 {quest.evidenceIds.length} 份
      </p>
      {verification !== null && verification.verdict !== 'pass' && (
        <div style={{ marginTop: 8 }}>
          <span className="ro-muted">最近一次核验（{verification.ruleVersion}）未通过：</span>
          <ul className="ro-list">{verification.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        </div>
      )}
      {canSubmit && <EvidenceForm quest={quest} run={run} busy={busy} client={client} hostId={hostId} />}
      {actions !== null && <div className="ro-row" style={{ marginTop: 12 }}>{actions}</div>}
    </div>
  )
}

function EvidenceForm({ quest, run, busy, client, hostId }: { quest: QuestView } & Omit<HostProps, 'dashboard'>) {
  const [kind, setKind] = useState<EvidenceKind>(quest.criteria[0]?.kind ?? 'manual')
  const [ref, setRef] = useState('')
  const [summary, setSummary] = useState('')
  const [attested, setAttested] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await client.execute('SubmitQuestEvidence', {
        questId: quest.id,
        evidence: [{ kind, ref, summary, observedAt: new Date().toISOString(), attested }],
      }, hostId)
      // Verification is deterministic and cheap, so run it right away.
      await client.execute('VerifyQuest', { questId: quest.id }, hostId)
      setRef('')
      setSummary('')
      setAttested(false)
    }, '证据已提交并完成核验。')
  }
  return (
    <form className="ro-form" style={{ marginTop: 12 }} onSubmit={submit}>
      <div className="ro-grid2">
        <label>证据类型<select className="ro-input" value={kind} onChange={e => setKind(e.target.value as EvidenceKind)}>
          {Object.entries(EVIDENCE_KIND).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>{kind === 'git_commit' ? '提交 SHA' : kind === 'link' ? 'URL' : '你做了什么'}
          <input className="ro-input" value={ref} onChange={e => setRef(e.target.value)} maxLength={500} required /></label>
      </div>
      <label>补充说明<input className="ro-input" value={summary} onChange={e => setSummary(e.target.value)} maxLength={1000} /></label>
      {kind === 'manual' && (
        <label className="ro-inline"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />我确认以上内容属实</label>
      )}
      <div><button className="ro-btn" data-primary type="submit" disabled={busy || ref.trim() === ''}>提交证据并核验</button></div>
    </form>
  )
}
