import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Dashboard, QuestView } from '@reorigin/application'
import { PERSONA_STYLE_INFO, type EvidenceKind, type PersonaStyle, type QuestType, type WorldEvent, type Consent } from '@reorigin/domain'
import { RemoteFailure, type AgentStatus, type Discovery, type ReOriginClient } from './api.ts'
import { Achievements, Audit, Growth, Memories, Settings } from './Cards.tsx'
import { ART, Awakening, LevelUp, SystemBoot, shouldBoot } from './Overlays.tsx'
import { Detected, Sources, openCandidates, useDiscovery } from './Sources.tsx'
import { EVIDENCE_KIND, QUEST_TYPE, SOURCE, STATUS, describeReason, relativeTime, type Ctx, type Run } from './shared.ts'

type Tab = 'today' | 'sources' | 'growth' | 'settings'
const TABS: readonly { id: Tab, label: string }[] = [
  { id: 'today', label: '面板' },
  { id: 'sources', label: '数据源' },
  { id: 'growth', label: '成长' },
  { id: 'settings', label: '设置' },
]
const CLOSED = ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED']

export function SystemPanel({ client }: { client: ReOriginClient }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [agent, setAgent] = useState<AgentStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [awakening, setAwakening] = useState<string | null>(null)
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [booting, setBooting] = useState(shouldBoot)
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

  // Proposals, tracked evidence and notices arrive from conversations and the System's heartbeat; pick them up while the panel is open.
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
  const closeBoot = useCallback(() => setBooting(false), [])

  return (
    <div className="ro-shell">
    {booting && <SystemBoot ready={dashboard !== null} name={host?.displayName ?? null} onDone={closeBoot} />}
    <div className="ro-root" data-testid="reorigin-panel" data-bound={host !== null}>
      {awakening !== null && <Awakening name={awakening} onDone={closeAwakening} />}
      {levelUp !== null && dashboard !== null && <LevelUp level={levelUp} chapter={dashboard.chapter} onDone={closeLevelUp} />}
      <div className="ro-wrap">
        {error !== null && <div className="ro-flash" data-tone="err" role="alert">{error}</div>}
        {notice !== null && <div className="ro-flash" role="status">{notice}</div>}
        {dashboard === null
          ? <div className="ro-boot">正在连接系统核心</div>
          : ctx === null
            ? <BindForm run={run} busy={busy} client={client} onBound={name => { setTab('today'); setAwakening(name) }} />
            : <HostView dashboard={dashboard} agent={agent} tab={tab} onTab={setTab} {...ctx} />}
      </div>
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
    <form className="ro-card ro-form ro-bind" onSubmit={submit}>
      <img className="ro-bind-emblem" src={ART.emblem} alt="" />
      <p className="ro-sys">【系统已觉醒】</p>
      <h1 className="ro-bind-title">检测到符合条件的宿主</h1>
      <p className="ro-note">人生没有读档键，但可以从这一刻重新开始。绑定后，系统会侦测你在 DSH 里常用的仓库，授权之后你的提交会自动变成任务进度。</p>
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
      <div className="ro-row">
        <button className="ro-btn" data-primary type="submit" disabled={busy || name.trim() === ''}>绑定宿主</button>
        <label className="ro-btn ro-file">从导出文件恢复…
          <input type="file" accept="application/json,.json" disabled={busy} onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file !== undefined) {
              void run(async () => {
                const restored = await client.importData(JSON.parse(await file.text()))
                if (!restored.ok) throw new RemoteFailure(restored.error.code, restored.error.message)
              }, '已从导出文件恢复。')
            }
          }} />
        </label>
      </div>
    </form>
  )
}

function HostView({ dashboard, agent, tab, onTab, ...ctx }: { dashboard: Dashboard, agent: AgentStatus | null, tab: Tab, onTab: (tab: Tab) => void } & Ctx) {
  const [discovery, refreshDiscovery] = useDiscovery(ctx.client)
  const detected = openCandidates(discovery).length
  return (
    <>
      <StatusWindow dashboard={dashboard} />
      <nav className="ro-tabs" role="tablist">
        {TABS.map(item => (
          <button key={item.id} role="tab" aria-selected={tab === item.id} className="ro-tab" onClick={() => onTab(item.id)}>
            {item.label}
            {item.id === 'sources' && detected > 0 && <span className="ro-pip" aria-label={`${detected} 个待授权`}>{detected}</span>}
            {item.id === 'today' && dashboard.unreadNotices > 0 && <span className="ro-pip">{dashboard.unreadNotices}</span>}
          </button>
        ))}
      </nav>
      {tab === 'today' && <Today dashboard={dashboard} discovery={discovery} onGranted={refreshDiscovery} {...ctx} />}
      {tab === 'sources' && <Sources dashboard={dashboard} discovery={discovery} onGranted={refreshDiscovery} {...ctx} />}
      {tab === 'growth' && (
        <>
          <Growth dashboard={dashboard} />
          {dashboard.growth.length === 0 && <section className="ro-card"><p className="ro-dim">完成第一个带成长标签的任务后，这里会出现技能评估。</p></section>}
          <Achievements dashboard={dashboard} {...ctx} />
          <Memories dashboard={dashboard} {...ctx} />
        </>
      )}
      {tab === 'settings' && (
        <>
          <Settings dashboard={dashboard} {...ctx} />
          <Audit dashboard={dashboard} />
          {agent !== null && (
            <p className="ro-dim" data-testid="reorigin-agent-status">
              {agent.connected && agent.toolRegistered
                ? `Agent 集成：已连接。在 DSH 会话中谈及你的目标时，Agent 可通过 ${agent.toolName} 向这里提议任务。`
                : 'Agent 集成：未连接（当前 DSH 组合没有提供工具或提示词服务）。'}
            </p>
          )}
        </>
      )}
    </>
  )
}

/** The hero: who the Host is in the System right now, and what it saw today. */
function StatusWindow({ dashboard }: { dashboard: Dashboard }) {
  const { host, progress, chapter, quests } = dashboard
  const today = new Date().toDateString()
  const observedToday = dashboard.recentCommits.filter(event => new Date(event.observedAt).toDateString() === today).length
  const running = quests.filter(quest => ['ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'NEEDS_EVIDENCE', 'PAUSED'].includes(quest.status)).length
  const claimable = quests.filter(quest => quest.status === 'COMPLETED' && !quest.settled && quest.retraction === null).length
  const percent = Math.min(100, (progress.intoLevel / progress.levelSpan) * 100)
  return (
    <header className="ro-status" data-testid="reorigin-status">
      <img className="ro-status-emblem" src={ART.emblem} alt="" />
      <div className="ro-status-id">
        <p className="ro-sys">【状态】第 {chapter.index} 章「{chapter.title}」</p>
        <h1 className="ro-name">{host!.displayName}</h1>
        {dashboard.title !== null && <p className="ro-title-worn" data-testid="reorigin-title">称号「{dashboard.title.name}」</p>}
        <p className="ro-epigraph">{chapter.epigraph}</p>
      </div>
      <div className="ro-status-level" aria-label={`等级 ${progress.level}`}>
        <span className="ro-lv">Lv</span>
        <span className="ro-level">{progress.level}</span>
      </div>
      <div className="ro-xp">
        <div className="ro-xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.levelSpan} aria-valuenow={progress.intoLevel}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <span className="ro-xp-num">{progress.intoLevel} / {progress.levelSpan} XP</span>
      </div>
      <dl className="ro-stats">
        <div><dt>今日观测</dt><dd>{observedToday}</dd></div>
        <div><dt>进行中</dt><dd>{running}</dd></div>
        <div data-hot={claimable > 0}><dt>待领取</dt><dd>{claimable}</dd></div>
        <div><dt>数据源</dt><dd>{dashboard.consents.filter(consent => consent.status === 'active').length}</dd></div>
      </dl>
    </header>
  )
}

function Today({ dashboard, discovery, onGranted, ...ctx }: { dashboard: Dashboard, discovery: Discovery | null, onGranted: () => void } & Ctx) {
  const { quests } = dashboard
  const [history, setHistory] = useState(false)
  const claimable = quests.filter(quest => quest.status === 'COMPLETED' && !quest.settled && quest.retraction === null)
  const proposed = quests.filter(quest => quest.status === 'PROPOSED' || quest.status === 'AVAILABLE')
  const running = quests.filter(quest => !CLOSED.includes(quest.status) && !proposed.includes(quest))
  const closed = quests.filter(quest => CLOSED.includes(quest.status) && !claimable.includes(quest))
  const card = (quest: QuestView) => <QuestCard key={quest.id} quest={quest} commits={dashboard.recentCommits} consents={dashboard.consents} autoEvidence={dashboard.preferences?.autoEvidence ?? true} {...ctx} />
  return (
    <>
      <Detected discovery={discovery} onGranted={onGranted} compact {...ctx} />
      {claimable.length > 0 && <Group title="待领取的奖励" tone="gold">{claimable.map(card)}</Group>}
      {proposed.length > 0 && <Group title="等你决定的任务">{proposed.map(card)}</Group>}
      <Group title="进行中">
        {running.length === 0 && <p className="ro-dim">没有进行中的任务。从下面挑一个开始，之后的提交会自动计入。</p>}
        {running.map(card)}
      </Group>
      <QuickQuests dashboard={dashboard} {...ctx} />
      <SystemLog dashboard={dashboard} {...ctx} />
      {closed.length > 0 && (
        <Group title={`历史（${closed.length}）`}>
          {history ? closed.map(card) : <button className="ro-link" onClick={() => setHistory(true)}>展开历史任务</button>}
        </Group>
      )}
    </>
  )
}

function Group({ title, tone, children }: { title: string, tone?: string, children: ReactNode }) {
  return (
    <section className="ro-group" data-tone={tone}>
      <h2 className="ro-group-title">{title}</h2>
      {children}
    </section>
  )
}

/** Notices and raw observations interleaved: what the System did and saw, newest first. */
function SystemLog({ dashboard, ...ctx }: { dashboard: Dashboard } & Ctx) {
  const consentName = new Map(dashboard.consents.map(consent => [consent.id, consent.scopeRef.split('/').filter(Boolean).pop() ?? consent.scopeRef]))
  const entries = [
    ...dashboard.notices.map(item => ({ key: item.id, at: item.createdAt, kind: 'notice' as const, title: item.title, body: item.body, unread: item.readAt === null })),
    ...dashboard.recentCommits.map(event => ({
      key: event.id,
      at: event.observedAt,
      kind: 'observed' as const,
      title: event.source === 'github_repo' ? '【观测·PR】' : '【观测·提交】',
      body: `${consentName.get(event.consentId) ?? ''}　${event.summary}`,
      unread: false,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12)
  return (
    <section className="ro-card ro-log" data-testid="reorigin-log">
      <div className="ro-row ro-spread">
        <h2 className="ro-h">系统日志</h2>
        {dashboard.unreadNotices > 0 && <button className="ro-btn ro-btn-quiet" disabled={ctx.busy} onClick={() => void ctx.run(() => ctx.client.execute('MarkNoticesRead', {}, ctx.hostId))}>全部已读</button>}
      </div>
      {entries.length === 0 && <p className="ro-dim">授权数据源后，你的提交、PR 和系统的判定都会出现在这里。</p>}
      <ol className="ro-log-list">
        {entries.map(entry => (
          <li key={entry.key} data-kind={entry.kind} data-unread={entry.unread}>
            <time dateTime={entry.at}>{relativeTime(entry.at)}</time>
            <span className="ro-log-title">{entry.title}</span>
            <span className="ro-log-body">{entry.body}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

interface Template {
  readonly key: string
  readonly label: string
  readonly hint: string
  readonly needs: 'git_repo' | 'github_repo'
  readonly payload: object
}

const TEMPLATES: readonly Template[] = [
  { key: 'daily-commit', label: '今天提交一次', hint: '日常 · 30 XP', needs: 'git_repo',
    payload: { type: 'daily', title: '今天提交一次', objective: '在任意授权仓库里留下一次提交。', xp: 30, skill: '节奏', criteria: [{ kind: 'git_commit', minCount: 1, description: '1 次授权仓库中的提交' }] } },
  { key: 'week-commits', label: '一周五次提交', hint: '7 天 · 120 XP', needs: 'git_repo',
    payload: { type: 'side', title: '一周五次提交', objective: '七天内在授权仓库里累计五次提交。', xp: 120, skill: '交付', expiresInDays: 7, criteria: [{ kind: 'git_commit', minCount: 5, description: '5 次授权仓库中的提交' }] } },
  { key: 'week-pr', label: '合并一个 PR', hint: '7 天 · 150 XP', needs: 'github_repo',
    payload: { type: 'side', title: '合并一个 PR', objective: '七天内在授权的 GitHub 仓库里合并一个自己的 PR。', xp: 150, skill: '协作', expiresInDays: 7, criteria: [{ kind: 'link', minCount: 1, description: '1 个授权 GitHub 仓库中合并的 PR' }] } },
]

/** One click publishes and accepts; the tracker does the rest. */
function QuickQuests({ dashboard, ...ctx }: { dashboard: Dashboard } & Ctx) {
  const [custom, setCustom] = useState(false)
  const sources = new Set(dashboard.consents.filter(consent => consent.status === 'active').map(consent => consent.source))
  const start = (template: Template) => void ctx.run(async () => {
    const outcome = await ctx.client.execute('ProposeQuest', template.payload, ctx.hostId)
    if (outcome.type === 'ProposeQuest') await ctx.client.execute('AcceptQuest', { questId: outcome.quest.id }, ctx.hostId)
  }, `已接受「${template.label}」。接下来的${template.needs === 'git_repo' ? '提交' : ' PR'}会自动计入。`)
  return (
    <section className="ro-card">
      <h2 className="ro-h">接一个任务</h2>
      <div className="ro-templates">
        {TEMPLATES.map(template => {
          const ready = sources.has(template.needs)
          return (
            <button key={template.key} className="ro-template" disabled={ctx.busy || !ready} onClick={() => start(template)}>
              <span className="ro-template-label">{template.label}</span>
              <span className="ro-dim">{ready ? template.hint : template.needs === 'git_repo' ? '先授权一个本地仓库' : '先授权一个 GitHub 仓库'}</span>
            </button>
          )
        })}
      </div>
      {custom ? <NewQuestForm {...ctx} onClose={() => setCustom(false)} /> : <button className="ro-link" onClick={() => setCustom(true)}>自定义任务</button>}
    </section>
  )
}

function NewQuestForm({ run, busy, client, hostId, onClose }: Ctx & { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [type, setType] = useState<QuestType>('side')
  const [kind, setKind] = useState<EvidenceKind>('git_commit')
  const [count, setCount] = useState(1)
  const [xp, setXp] = useState(100)
  const [skill, setSkill] = useState('')
  const [days, setDays] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await client.execute('ProposeQuest', {
        type, title, objective, xp, skill,
        ...(days === '' ? {} : { expiresInDays: Number(days) }),
        criteria: [{ kind, minCount: count, description: `${count} 份${EVIDENCE_KIND[kind]}证据` }],
      }, hostId)
      onClose()
      setTitle('')
      setObjective('')
    }, '任务已发布。')
  }
  return (
    <form className="ro-form ro-custom" onSubmit={submit}>
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
        <button className="ro-btn" type="button" onClick={onClose}>取消</button>
      </div>
    </form>
  )
}

function QuestCard({ quest, commits, consents, autoEvidence, run, busy, client, hostId }: { quest: QuestView, commits: readonly WorldEvent[], consents: readonly Consent[], autoEvidence: boolean } & Ctx) {
  const [manual, setManual] = useState(false)
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
  const open = !CLOSED.includes(quest.status)
  const granted = new Set(consents.filter(consent => consent.status === 'active').map(consent => consent.source))
  // Every criterion a granted source can satisfy is filled by the tracker; manual evidence stays the Host's to submit.
  const tracked = autoEvidence && quest.criteria.every(criterion =>
    (criterion.kind === 'git_commit' && granted.has('git_repo')) || (criterion.kind === 'link' && granted.has('github_repo')))
  const required = quest.criteria.reduce((sum, criterion) => sum + criterion.minCount, 0)
  const held = Math.min(required, quest.evidenceIds.length)
  return (
    <article className="ro-quest" data-testid={`quest-${quest.status}`} data-hidden={quest.type === 'hidden'} data-tone={status.tone}>
      <div className="ro-quest-head">
        <span className="ro-tag" data-tone={status.tone}>{status.label}</span>
        <h3 className="ro-quest-title">【{QUEST_TYPE[quest.type]}】{quest.title}</h3>
        <span className="ro-reward">{quest.retraction !== null ? '不计入成长' : quest.settled ? `已结算 +${quest.reward.xp}` : `+${quest.reward.xp} XP`}</span>
      </div>
      {open && quest.status !== 'PROPOSED' && quest.status !== 'AVAILABLE' && (
        <div className="ro-meter" aria-label={`证据 ${held} / ${required}`}>
          {Array.from({ length: Math.min(required, 20) }, (_, index) => <span key={index} data-on={index < held} />)}
          <span className="ro-meter-label">{held} / {required}{tracked ? ' · 自动追踪中' : ''}</span>
        </div>
      )}
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
      <p className="ro-dim" style={{ margin: '6px 0 0' }}>
        {quest.skill !== '' && `${quest.skill}　`}来源：{SOURCE[quest.source]}
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
      {quest.reviewNotes.length > 0 && (
        <div className="ro-review" data-testid="reorigin-review-notes">
          <span className="ro-badge" data-tone="accent">Agent 附注 · 不参与裁决</span>
          <ul className="ro-list">{quest.reviewNotes.map(note => <li key={note.id}>{note.note} <span className="ro-muted">· {relativeTime(note.createdAt)}</span></li>)}</ul>
        </div>
      )}
      {open && <label className="ro-check ro-dim" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={quest.agentReview} disabled={busy} onChange={e => void run(
          () => client.execute('AllowAgentReview', { questId: quest.id, allow: e.target.checked }, hostId),
          e.target.checked ? '已允许 Agent 查看此任务的证据并留下附注。' : '已收回 Agent 对此任务的查看权限。',
        )} />
        允许 Agent 查看此任务的证据并留下点评（只供参考，不影响核验与奖励）
      </label>}
      {quest.status === 'COMPLETED' && quest.retraction === null && <RetractForm quest={quest} run={run} busy={busy} client={client} hostId={hostId} />}
      {canSubmit && tracked && !manual && <button className="ro-link" onClick={() => setManual(true)}>手动补交证据</button>}
      {canSubmit && (!tracked || manual) && <EvidenceForm quest={quest} commits={commits} consents={consents} run={run} busy={busy} client={client} hostId={hostId} />}
      {actions !== null && <div className="ro-row" style={{ marginTop: 12 }}>{actions}</div>}
    </article>
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

function EvidenceForm({ quest, commits, consents, run, busy, client, hostId }: { quest: QuestView, commits: readonly WorldEvent[], consents: readonly Consent[] } & Ctx) {
  const [kind, setKind] = useState<EvidenceKind>(quest.criteria[0]?.kind ?? 'manual')
  const [ref, setRef] = useState('')
  const [summary, setSummary] = useState('')
  const [attested, setAttested] = useState(false)
  // Activity after acceptance is the only kind the verifier will count.
  const recent = commits.filter(event => quest.acceptedAt === null || event.observedAt >= quest.acceptedAt)
  const eligible = recent.filter(event => event.source === 'git_repo')
  const slugOf = new Map(consents.map(consent => [consent.id, consent.scopeRef]))
  const pulls = recent.filter(event => event.source === 'github_repo' && slugOf.has(event.consentId))
    .map(event => ({ ...event, url: `https://github.com/${slugOf.get(event.consentId)!}/pull/${event.externalId.slice(3)}` }))
  const corroborated = kind === 'git_commit'
    ? eligible.some(commit => ref.trim().length >= 7 && commit.externalId.startsWith(ref.trim().toLowerCase()))
    : kind === 'link' && pulls.some(pull => ref.trim().toLowerCase().startsWith(pull.url))
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
        {kind === 'link' && pulls.length > 0 && (
          <label>从授权的 GitHub 仓库选择<select className="ro-input" value="" onChange={e => setRef(e.target.value)}>
            <option value="">— 选择接受任务之后合并的 PR —</option>
            {pulls.map(pull => <option key={pull.id} value={pull.url}>#{pull.externalId.slice(3)} · {pull.summary}</option>)}
          </select></label>
        )}
        <label>{kind === 'git_commit' ? '提交 SHA' : kind === 'link' ? 'URL' : '你做了什么'}
          <input className="ro-input" value={ref} onChange={e => setRef(e.target.value)} maxLength={500} required /></label>
      </div>
      <label>补充说明<input className="ro-input" value={summary} onChange={e => setSummary(e.target.value)} maxLength={1000} /></label>
      {corroborated
        ? <p className="ro-muted" style={{ margin: 0 }}>✓ 来自已授权数据源，将作为「已佐证」证据，时间以来源记录为准。</p>
        : <label className="ro-inline"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />我确认以上内容属实（没有授权数据源佐证时必须确认）</label>}
      <div><button className="ro-btn" data-primary type="submit" disabled={busy || ref.trim() === ''}>提交证据并核验</button></div>
    </form>
  )
}
