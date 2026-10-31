import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Dashboard, QuestView } from '@reorigin/application'
import { PERSONA_STYLE_INFO, type EvidenceKind, type PersonaStyle, type QuestType, type WorldEvent } from '@reorigin/domain'
import { RemoteFailure, type AgentStatus, type ReOriginClient } from './api.ts'
import { Achievements, Audit, Growth, Memories, Notices, Settings } from './Cards.tsx'
import { Awakening, LevelUp } from './Overlays.tsx'
import { EVIDENCE_KIND, QUEST_TYPE, SOURCE, STATUS, describeReason, relativeTime, type Ctx, type Run } from './shared.ts'

export function SystemPanel({ client }: { client: ReOriginClient }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [agent, setAgent] = useState<AgentStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [awakening, setAwakening] = useState<string | null>(null)
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const lastLevel = useRef<number | null>(null)

  const reload = useCallback(async () => {
    const [next, status] = await Promise.all([client.dashboard(), client.agentStatus()])
    // Celebrate a level reached while this page was open; a fresh page load is not a level-up.
    if (next.host !== null && lastLevel.current !== null && next.progress.level > lastLevel.current) setLevelUp(next.progress.level)
    lastLevel.current = next.host === null ? null : next.progress.level
    setDashboard(next)
    setAgent(status)
  }, [client])

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

  // Proposals and notices arrive from conversations and the System's heartbeat; pick them up while the panel is open.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') reload().catch(() => {}) }
    const timer = window.setInterval(refresh, 10_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [reload])

  const host = dashboard?.host ?? null
  const ctx: Ctx | null = host === null ? null : { run, busy, client, hostId: host.id }
  const closeAwakening = useCallback(() => setAwakening(null), [])
  const closeLevelUp = useCallback(() => setLevelUp(null), [])

  return (
    <div className="ro-root" data-testid="reorigin-panel">
      {awakening !== null && <Awakening name={awakening} onDone={closeAwakening} />}
      {levelUp !== null && dashboard !== null && <LevelUp level={levelUp} chapter={dashboard.chapter} onDone={closeLevelUp} />}
      <div className="ro-wrap">
        <div>
          <div className="ro-kicker">Re:Origin · System Terminal{host !== null && dashboard !== null ? ` · 第 ${dashboard.chapter.index} 章「${dashboard.chapter.title}」` : ''}</div>
          <h1 className="ro-title">{host !== null ? '【系统运行中】' : '【系统已觉醒】'}</h1>
          <p className="ro-sub">{host !== null && dashboard !== null
            ? dashboard.chapter.epigraph
            : '检测到符合条件的宿主。人生没有读档键，但可以从这一刻重新开始。'}</p>
        </div>
        {error !== null && <div className="ro-card ro-error" role="alert">{error}</div>}
        {notice !== null && <div className="ro-card ro-toast" role="status">{notice}</div>}
        {dashboard === null
          ? <div className="ro-muted">连接系统核心…</div>
          : ctx === null
            ? <BindForm run={run} busy={busy} client={client} onBound={setAwakening} />
            : <HostView dashboard={dashboard} {...ctx} />}
        {agent !== null && (
          <p className="ro-muted" data-testid="reorigin-agent-status">
            {agent.connected && agent.toolRegistered
              ? `Agent 集成：已连接。在 DSH 会话中谈及你的目标时，Agent 可通过 ${agent.toolName} 向这里提议任务。`
              : 'Agent 集成：未连接（当前 DSH 组合没有提供工具或提示词服务）。'}
          </p>
        )}
      </div>
    </div>
  )
}

function BindForm({ run, busy, client, onBound }: { run: Run, busy: boolean, client: ReOriginClient, onBound: (name: string) => void }) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [persona, setPersona] = useState<PersonaStyle>('calm')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await client.execute('BindHost', { displayName: name, goals: goal.trim() ? [goal] : [], persona })
      onBound(name.trim())
    }, '宿主绑定完成。系统将与你一同成长。')
  }
  return (
    <form className="ro-card ro-form" onSubmit={submit}>
      <p className="ro-section-title">宿主绑定</p>
      <label>宿主称呼<input className="ro-input" value={name} onChange={e => setName(e.target.value)} maxLength={40} required /></label>
      <label>当前主线目标（可选）<input className="ro-input" value={goal} onChange={e => setGoal(e.target.value)} maxLength={200} placeholder="例如：成为能独立交付的工程师" /></label>
      <fieldset className="ro-persona">
        <legend>系统人格（只改变对话语气，之后可在系统设置中更换）</legend>
        {Object.entries(PERSONA_STYLE_INFO).map(([style, info]) => (
          <label key={style} className="ro-inline">
            <input type="radio" name="persona" value={style} checked={persona === style} onChange={() => setPersona(style as PersonaStyle)} />
            <span><span className="ro-strong">{info.name}</span> <span className="ro-muted">{info.description}</span></span>
          </label>
        ))}
      </fieldset>
      <div><button className="ro-btn" data-primary type="submit" disabled={busy || name.trim() === ''}>绑定宿主</button></div>
    </form>
  )
}

function HostView({ dashboard, ...ctx }: { dashboard: Dashboard } & Ctx) {
  const { host, progress, quests } = dashboard
  const active = quests.filter(quest => !['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(quest.status) || (quest.status === 'COMPLETED' && !quest.settled && quest.retraction === null))
  const closed = quests.filter(quest => !active.includes(quest))
  return (
    <>
      <div className="ro-card">
        <div className="ro-row ro-spread">
          <div className="ro-row">
            <span className="ro-level">Lv.{progress.level}</span>
            <span className="ro-muted ro-mono">XP {progress.xp}</span>
            {dashboard.title !== null && <span className="ro-badge" data-tone="accent" data-testid="reorigin-title">「{dashboard.title.name}」</span>}
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

      <Notices dashboard={dashboard} {...ctx} />
      <Settings dashboard={dashboard} {...ctx} />
      <NewQuestForm {...ctx} />

      <p className="ro-section-title">进行中的任务（{active.length}）</p>
      {active.length === 0 && <div className="ro-muted">暂无任务。发布一条与你主线目标相关的现实任务吧。</div>}
      {active.map(quest => <QuestCard key={quest.id} quest={quest} commits={dashboard.recentCommits} {...ctx} />)}

      <Growth dashboard={dashboard} />
      <Achievements dashboard={dashboard} {...ctx} />
      <Memories dashboard={dashboard} {...ctx} />
      <Audit dashboard={dashboard} />

      {closed.length > 0 && <p className="ro-section-title">历史（{closed.length}）</p>}
      {closed.map(quest => <QuestCard key={quest.id} quest={quest} commits={dashboard.recentCommits} {...ctx} />)}
    </>
  )
}

function NewQuestForm({ run, busy, client, hostId }: Ctx) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [type, setType] = useState<QuestType>('side')
  const [kind, setKind] = useState<EvidenceKind>('git_commit')
  const [count, setCount] = useState(1)
  const [xp, setXp] = useState(100)
  const [skill, setSkill] = useState('')
  const [days, setDays] = useState('')
  if (!open) return <div><button className="ro-btn" onClick={() => setOpen(true)}>＋ 发布新任务</button></div>
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await client.execute('ProposeQuest', {
        type, title, objective, xp, skill,
        ...(days === '' ? {} : { expiresInDays: Number(days) }),
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
        <label>成长标签（可选）<input className="ro-input" value={skill} onChange={e => setSkill(e.target.value)} maxLength={20} placeholder="例如：测试工程" /></label>
        <label>期限天数（可选{type === 'daily' ? '，日常默认 1' : ''}）<input className="ro-input" type="number" min={1} max={90} value={days} onChange={e => setDays(e.target.value)} /></label>
      </div>
      <div className="ro-row">
        <button className="ro-btn" data-primary type="submit" disabled={busy || title.trim() === ''}>发布</button>
        <button className="ro-btn" type="button" onClick={() => setOpen(false)}>取消</button>
      </div>
    </form>
  )
}

function QuestCard({ quest, commits, run, busy, client, hostId }: { quest: QuestView, commits: readonly WorldEvent[] } & Ctx) {
  const status = STATUS[quest.status]
  const act = (type: 'AcceptQuest' | 'CancelQuest' | 'PauseQuest' | 'ResumeQuest' | 'VerifyQuest' | 'SettleQuest', message: string) =>
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
  } else if (quest.status === 'COMPLETED' && !quest.settled && quest.retraction === null) {
    actions = <button className="ro-btn" data-primary disabled={busy} onClick={act('SettleQuest', `结算完成：+${quest.reward.xp} XP`)}>领取奖励 +{quest.reward.xp} XP</button>
  } else if (quest.status === 'ACCEPTED' || quest.status === 'IN_PROGRESS') {
    actions = <>
      <button className="ro-btn" disabled={busy} onClick={act('PauseQuest', '任务已暂停，期限在暂停期间不计时。')}>暂停</button>
      <button className="ro-btn" disabled={busy} onClick={act('CancelQuest', '已放弃该任务。')}>放弃</button>
    </>
  } else if (quest.status === 'PAUSED') {
    actions = <>
      <button className="ro-btn" data-primary disabled={busy} onClick={act('ResumeQuest', '任务已恢复，期限顺延。')}>继续任务</button>
      <button className="ro-btn" disabled={busy} onClick={act('CancelQuest', '已放弃该任务。')}>放弃</button>
    </>
  }
  const open = !['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(quest.status)
  return (
    <div className="ro-card" data-testid={`quest-${quest.status}`} data-hidden={quest.type === 'hidden'}>
      <div className="ro-row ro-spread">
        <div className="ro-row">
          <span className="ro-badge" data-tone={status.tone}>{status.label}</span>
          <span className="ro-quest-title">【{QUEST_TYPE[quest.type]}任务：{quest.title}】</span>
          {quest.skill !== '' && <span className="ro-badge" data-tone="muted">{quest.skill}</span>}
        </div>
        <span className="ro-muted ro-mono">{quest.retraction !== null ? '不计入成长' : quest.settled ? `已结算 +${quest.reward.xp} XP` : `奖励 ${quest.reward.xp} XP`}</span>
      </div>
      {quest.objective !== '' && <p style={{ margin: '8px 0 0' }}>{quest.objective}</p>}
      {quest.source !== 'host' && (
        <p className="ro-proposal">
          <span className="ro-badge" data-tone="accent">{quest.source === 'system' ? '系统发现' : '系统提议'}</span>
          {quest.rationale !== '' ? `理由：${quest.rationale}` : '（未说明理由）'}
          {quest.status === 'PROPOSED' && <span className="ro-muted"> · 接受与否由你决定</span>}
        </p>
      )}
      <ul className="ro-list">
        {quest.criteria.map(criterion => <li key={criterion.description}>验收：{criterion.description}</li>)}
      </ul>
      <p className="ro-muted" style={{ margin: '6px 0 0' }}>
        来源：{SOURCE[quest.source]} · 已提交证据 {quest.evidenceIds.length} 份
        {quest.expiresAt !== null && open && (quest.status === 'PAUSED' ? ' · 期限已冻结，恢复后顺延' : ` · 期限：${relativeTime(quest.expiresAt)}`)}
      </p>
      {verification !== null && verification.verdict !== 'pass' && (
        <div style={{ marginTop: 8 }}>
          <span className="ro-muted">最近一次核验（{verification.ruleVersion}）{verification.verdict === 'reject' ? '已驳回' : '未通过'}：</span>
          <ul className="ro-list">{verification.reasons.map((reason, index) => <li key={index}>{describeReason(reason)}</li>)}</ul>
        </div>
      )}
      {quest.retraction !== null && (
        <p className="ro-proposal">
          <span className="ro-badge" data-tone="err">已撤回</span>
          {quest.retraction.reason}{quest.retraction.xpReversed > 0 ? ` · 已扣回 ${quest.retraction.xpReversed} XP` : ''} · {relativeTime(quest.retraction.correctedAt)}
        </p>
      )}
      {quest.status === 'COMPLETED' && quest.retraction === null && <RetractForm quest={quest} run={run} busy={busy} client={client} hostId={hostId} />}
      {canSubmit && <EvidenceForm quest={quest} commits={commits} run={run} busy={busy} client={client} hostId={hostId} />}
      {actions !== null && <div className="ro-row" style={{ marginTop: 12 }}>{actions}</div>}
    </div>
  )
}

/** Taking a completion back is the Host's correction; it compensates rather than rewrites (docs/05). */
function RetractForm({ quest, run, busy, client, hostId }: { quest: QuestView } & Ctx) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  if (!open) return <div style={{ marginTop: 8 }}><button className="ro-link" style={{ marginLeft: 0 }} onClick={() => setOpen(true)}>这次完成不该算？撤回</button></div>
  return (
    <form className="ro-form" style={{ marginTop: 10 }} onSubmit={event => {
      event.preventDefault()
      void run(() => client.execute('RetractCompletion', { questId: quest.id, reason }, hostId), quest.settled ? `已撤回，扣回 ${quest.reward.xp} XP。` : '已撤回。')
    }}>
      <p className="ro-muted" style={{ margin: 0 }}>
        撤回不会改写历史：任务和核验记录保留，另记一条纠错{quest.settled ? `，并在账本中追加一笔 -${quest.reward.xp} XP 的补偿` : '，之后不能再领取奖励'}。该任务不再计入技能评估与成就，相关里程碑记忆会被忘记。撤回无法取消。
      </p>
      <label>理由<input className="ro-input" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="例如：提交的证据其实是同事的提交" /></label>
      <div className="ro-row">
        <button className="ro-btn ro-danger" type="submit" disabled={busy || reason.trim().length < 2}>确认撤回</button>
        <button className="ro-btn" type="button" onClick={() => setOpen(false)}>取消</button>
      </div>
    </form>
  )
}

function EvidenceForm({ quest, commits, run, busy, client, hostId }: { quest: QuestView, commits: readonly WorldEvent[] } & Ctx) {
  const [kind, setKind] = useState<EvidenceKind>(quest.criteria[0]?.kind ?? 'manual')
  const [ref, setRef] = useState('')
  const [summary, setSummary] = useState('')
  const [attested, setAttested] = useState(false)
  // Commits made after acceptance are the only ones the verifier will count.
  const eligible = commits.filter(commit => quest.acceptedAt === null || commit.observedAt >= quest.acceptedAt)
  const corroborated = kind === 'git_commit' && eligible.some(commit => ref.trim().length >= 7 && commit.externalId.startsWith(ref.trim().toLowerCase()))
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
        {kind === 'git_commit' && eligible.length > 0 && (
          <label>从授权仓库选择<select className="ro-input" value="" onChange={e => setRef(e.target.value)}>
            <option value="">— 选择接受任务之后的提交 —</option>
            {eligible.map(commit => <option key={commit.id} value={commit.externalId}>{commit.externalId.slice(0, 8)} · {commit.summary}</option>)}
          </select></label>
        )}
        <label>{kind === 'git_commit' ? '提交 SHA' : kind === 'link' ? 'URL' : '你做了什么'}
          <input className="ro-input" value={ref} onChange={e => setRef(e.target.value)} maxLength={500} required /></label>
      </div>
      <label>补充说明<input className="ro-input" value={summary} onChange={e => setSummary(e.target.value)} maxLength={1000} /></label>
      {corroborated
        ? <p className="ro-muted" style={{ margin: 0 }}>✓ 该提交来自已授权仓库，将作为「已佐证」证据，时间以仓库记录为准。</p>
        : <label className="ro-inline"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />我确认以上内容属实（没有授权数据源佐证时必须确认）</label>}
      <div><button className="ro-btn" data-primary type="submit" disabled={busy || ref.trim() === ''}>提交证据并核验</button></div>
    </form>
  )
}
