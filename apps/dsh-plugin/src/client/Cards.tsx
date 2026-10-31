// Secondary panel cards: notices, skill assessments, achievements, memories, and System settings
// (consented data sources and how proactive the System may be).
import { useState, type FormEvent } from 'react'
import type { Dashboard } from '@reorigin/application'
import { CONFIDENCE_LABEL, PERSONA_STYLE_INFO, SKILL_TIERS, tierLabel, type PersonaStyle, type QuestStatus, type SkillTier } from '@reorigin/domain'
import { setVoiceEnabled, voiceEnabled } from './Overlays.tsx'
import { EVENT_LABEL, STATUS, eventActor, relativeTime, type Ctx } from './shared.ts'

export function Notices({ dashboard, run, busy, client, hostId }: { dashboard: Dashboard } & Ctx) {
  if (dashboard.notices.length === 0) return null
  return (
    <div className="ro-card" data-testid="reorigin-notices">
      <div className="ro-row ro-spread">
        <p className="ro-section-title">系统消息{dashboard.unreadNotices > 0 ? `（${dashboard.unreadNotices} 条未读）` : ''}</p>
        {dashboard.unreadNotices > 0 && (
          <button className="ro-btn" disabled={busy} onClick={() => void run(() => client.execute('MarkNoticesRead', {}, hostId))}>全部已读</button>
        )}
      </div>
      <ul className="ro-feed">
        {dashboard.notices.slice(0, 8).map(item => (
          <li key={item.id} data-unread={item.readAt === null}>
            <span className="ro-strong">{item.title}</span> {item.body}
            <span className="ro-muted"> · {relativeTime(item.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Growth({ dashboard }: { dashboard: Dashboard }) {
  if (dashboard.growth.length === 0) return null
  const max = Math.max(...dashboard.growth.map(track => track.completions))
  const assessments = new Map(dashboard.skills.map(item => [item.skill, item]))
  return (
    <div className="ro-card" data-testid="reorigin-growth">
      <p className="ro-section-title">技能评估</p>
      <p className="ro-muted" style={{ margin: '4px 0 10px' }}>
        按成长标签、只依据经核验完成的任务计算（{dashboard.skills[0]?.ruleVersion ?? 'assessment-v1'}），与 XP 分开。置信度取决于证据中有多少由授权来源佐证。只反映系统内的记录，不代表系统外的能力。
      </p>
      {dashboard.growth.map(track => {
        const assessment = assessments.get(track.skill)
        return (
          <div key={track.skill} className="ro-skill">
            <div className="ro-track">
              <span className="ro-track-name">{track.skill}</span>
              <div className="ro-bar"><span style={{ width: `${(track.completions / max) * 100}%` }} /></div>
              <span className="ro-muted ro-mono">×{track.completions} · {track.xp} XP</span>
            </div>
            {assessment === undefined
              ? track.skill === '未分类' && <p className="ro-muted ro-skill-basis">未打标签的任务不参与技能评估。</p>
              : (
                <p className="ro-skill-basis">
                  <span className="ro-badge" data-tone={assessment.tier >= 3 ? 'ok' : 'accent'}>{tierLabel(assessment.tier)}</span>
                  <span className="ro-badge" data-tone={assessment.confidence === 'high' ? 'ok' : assessment.confidence === 'medium' ? 'warn' : 'muted'}>置信度{CONFIDENCE_LABEL[assessment.confidence]}</span>
                  <span className="ro-muted">
                    {assessment.basis.quests} 个任务 · {assessment.basis.activeDays} 个活跃日 · 跨度 {assessment.basis.spanDays} 天 · 佐证 {assessment.basis.corroborated}/{assessment.basis.evidence}
                    {assessment.tier < 4 && ` · 下一级「${tierLabel((assessment.tier + 1) as SkillTier)}」：${SKILL_TIERS[assessment.tier]!.requirement}`}
                  </span>
                </p>
              )}
          </div>
        )
      })}
    </div>
  )
}

export function Achievements({ dashboard, run, busy, client, hostId }: { dashboard: Dashboard } & Ctx) {
  if (dashboard.achievements.length === 0) return null
  const equipped = dashboard.title?.key ?? null
  return (
    <div className="ro-card" data-testid="reorigin-achievements">
      <p className="ro-section-title">成就与称号（{dashboard.achievements.length}）</p>
      <p className="ro-muted" style={{ margin: '4px 0 8px' }}>每一项都由确定性规则从经核验的记录中解锁，模型无法授予。称号可以佩戴在等级旁。</p>
      <ul className="ro-feed">
        {dashboard.achievements.map(item => (
          <li key={item.id} data-inactive={!item.active}>
            <span className="ro-badge" data-tone={!item.active ? 'muted' : item.kind === 'title' ? 'accent' : 'ok'}>{item.kind === 'title' ? '称号' : '徽章'}</span>{' '}
            <span className="ro-strong">{item.name}</span> <span className="ro-muted">{item.description} · {relativeTime(item.grantedAt)}{!item.active && ' · 依据已因撤回不再成立'}</span>
            {item.kind === 'title' && item.active && (
              <button className="ro-link" disabled={busy} onClick={() => void run(
                () => client.execute('EquipTitle', { titleKey: item.key === equipped ? null : item.key }, hostId),
                item.key === equipped ? '已卸下称号。' : `已佩戴称号「${item.name}」。`,
              )}>{item.key === equipped ? '卸下' : '佩戴'}</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Memories({ dashboard, run, busy, client, hostId }: { dashboard: Dashboard } & Ctx) {
  const [text, setText] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await client.execute('AddMemory', { text }, hostId)
      setText('')
    }, '系统已记住。')
  }
  return (
    <div className="ro-card" data-testid="reorigin-memories">
      <p className="ro-section-title">系统记忆</p>
      <p className="ro-muted" style={{ margin: '4px 0 8px' }}>Agent 会把这些作为背景参考。里程碑由完成的任务自动生成；任何一条都可以让系统忘记。</p>
      {dashboard.memories.length === 0 && <p className="ro-muted">暂无记忆。</p>}
      <ul className="ro-feed">
        {dashboard.memories.map(memory => (
          <li key={memory.id}>
            <span className="ro-badge" data-tone={memory.kind === 'milestone' ? 'ok' : 'muted'}>{memory.kind === 'milestone' ? '里程碑' : '笔记'}</span> {memory.text}
            <button className="ro-link" disabled={busy} onClick={() => void run(() => client.execute('ForgetMemory', { memoryId: memory.id }, hostId), '已忘记。')}>忘记</button>
          </li>
        ))}
      </ul>
      <form className="ro-row" style={{ marginTop: 8 }} onSubmit={submit}>
        <input className="ro-input" style={{ flex: 1 }} value={text} onChange={e => setText(e.target.value)} maxLength={300} placeholder="让系统记住一件事，例如：我更喜欢早上做深度工作" />
        <button className="ro-btn" type="submit" disabled={busy || text.trim() === ''}>记住</button>
      </form>
    </div>
  )
}

export function Settings({ dashboard, run, busy, client, hostId }: { dashboard: Dashboard } & Ctx) {
  const [open, setOpen] = useState(false)
  const [repo, setRepo] = useState('')
  const [email, setEmail] = useState('')
  const [deleteData, setDeleteData] = useState(true)
  const preferences = dashboard.preferences
  const [quiet, setQuiet] = useState(preferences?.quietHours !== null)
  const [start, setStart] = useState(preferences?.quietHours?.start ?? 23)
  const [end, setEnd] = useState(preferences?.quietHours?.end ?? 8)
  const [perDay, setPerDay] = useState(preferences?.systemProposalsPerDay ?? 1)
  const [persona, setPersona] = useState<PersonaStyle>(preferences?.persona ?? 'calm')
  const [voice, setVoice] = useState(voiceEnabled)
  const active = dashboard.consents.filter(consent => consent.status === 'active')

  if (!open) {
    return (
      <div className="ro-row">
        <button className="ro-btn" onClick={() => setOpen(true)}>系统设置 · 数据源 {active.length} 个</button>
        <button className="ro-btn" disabled={busy} onClick={() => void run(() => client.syncNow(), '已与授权数据源同步。')}>立即同步</button>
      </div>
    )
  }
  const grant = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await client.execute('GrantConsent', { source: 'git_repo', scopeRef: repo.trim(), authorEmail: email.trim() }, hostId)
      setRepo('')
    }, '已授权。系统只读取该仓库中这个邮箱作者的提交：SHA、时间、标题与改动文件数。')
  }
  const hours = Array.from({ length: 24 }, (_, hour) => hour)
  return (
    <div className="ro-card ro-form" data-testid="reorigin-settings">
      <div className="ro-row ro-spread">
        <p className="ro-section-title">系统设置</p>
        <button className="ro-btn" onClick={() => setOpen(false)}>收起</button>
      </div>

      <p className="ro-section-title">数据源授权</p>
      <p className="ro-muted" style={{ margin: 0 }}>系统只观察你明确授权的来源。来自授权仓库的提交可作为「已佐证」证据，时间以仓库记录为准。</p>
      {dashboard.consents.length === 0 && <p className="ro-muted" style={{ margin: 0 }}>尚未授权任何数据源。</p>}
      {dashboard.consents.map(consent => (
        <div key={consent.id} className="ro-row ro-spread ro-consent">
          <span>
            <span className="ro-badge" data-tone={consent.status === 'active' ? 'ok' : 'muted'}>{consent.status === 'active' ? '生效中' : '已撤销'}</span>{' '}
            <span className="ro-mono">{consent.scopeRef}</span> <span className="ro-muted">· {consent.authorEmail}</span>
          </span>
          {consent.status === 'active' && (
            <button className="ro-btn" disabled={busy} onClick={() => void run(
              () => client.execute('RevokeConsent', { consentId: consent.id, deleteData }, hostId),
              deleteData ? '已撤销授权，并删除了从该来源采集的数据。' : '已撤销授权，系统不再采集该来源。',
            )}>撤销</button>
          )}
        </div>
      ))}
      {active.length > 0 && (
        <label className="ro-inline"><input type="checkbox" checked={deleteData} onChange={e => setDeleteData(e.target.checked)} />撤销时同时删除已采集的数据</label>
      )}
      <form className="ro-grid2" onSubmit={grant}>
        <label>本地仓库绝对路径<input className="ro-input ro-mono" value={repo} onChange={e => setRepo(e.target.value)} placeholder="/Users/me/projects/app" required /></label>
        <label>你的提交邮箱<input className="ro-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <div><button className="ro-btn" data-primary type="submit" disabled={busy || repo.trim() === '' || email.trim() === ''}>授权该仓库</button></div>
      </form>

      <p className="ro-section-title">主动程度与人格</p>
      <label className="ro-inline"><input type="checkbox" checked={quiet} onChange={e => setQuiet(e.target.checked)} />免打扰时段内不生成提醒和系统任务</label>
      <div className="ro-grid2">
        <label>免打扰开始<select className="ro-input" value={start} disabled={!quiet} onChange={e => setStart(Number(e.target.value))}>{hours.map(hour => <option key={hour} value={hour}>{hour}:00</option>)}</select></label>
        <label>免打扰结束<select className="ro-input" value={end} disabled={!quiet} onChange={e => setEnd(Number(e.target.value))}>{hours.map(hour => <option key={hour} value={hour}>{hour}:00</option>)}</select></label>
        <label>每天最多系统任务<select className="ro-input" value={perDay} onChange={e => setPerDay(Number(e.target.value))}>{[0, 1, 2, 3].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
        <label>系统人格（对话语气）<select className="ro-input" value={persona} onChange={e => setPersona(e.target.value as PersonaStyle)}>
          {Object.entries(PERSONA_STYLE_INFO).map(([style, info]) => <option key={style} value={style}>{info.name}</option>)}
        </select></label>
      </div>
      <label className="ro-inline"><input type="checkbox" checked={voice} onChange={e => { setVoiceEnabled(e.target.checked); setVoice(e.target.checked) }} />系统播报：觉醒与升级时朗读（仅本浏览器）</label>
      <div className="ro-row">
        <button className="ro-btn" data-primary disabled={busy} onClick={() => void run(
          () => client.execute('UpdatePreferences', { quietHours: quiet ? { start, end } : null, systemProposalsPerDay: perDay, persona }, hostId),
          '设置已保存。',
        )}>保存</button>
        <button className="ro-btn" disabled={busy} onClick={() => void run(() => client.syncNow(), '已与授权数据源同步。')}>立即同步</button>
      </div>

      <DataRights dashboard={dashboard} run={run} busy={busy} client={client} hostId={hostId} />
    </div>
  )
}

/** Take everything away, or erase it (docs/01 principle 6). */
function DataRights({ dashboard, run, busy, client, hostId }: { dashboard: Dashboard } & Ctx) {
  const [confirm, setConfirm] = useState('')
  const name = dashboard.host?.displayName ?? ''
  const download = () => void run(async () => {
    const data = await client.exportData()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `reorigin-export-${data.exportedAt.slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, '已导出全部数据。')
  return (
    <>
      <p className="ro-section-title">我的数据</p>
      <p className="ro-muted" style={{ margin: 0 }}>
        所有数据只保存在本机（DSH 目录下的 reorigin.db）。导出会得到一份包含宿主资料、任务、证据、核验、账本、评估、成就、授权、采集记录、消息、记忆与审计事件的 JSON。
      </p>
      <div><button className="ro-btn" disabled={busy} onClick={download}>导出全部数据</button></div>
      <p className="ro-muted" style={{ margin: 0 }}>
        删除会抹去以上全部记录，包括只追加的审计与账本，且无法恢复；系统回到未绑定状态。建议先导出。
      </p>
      <div className="ro-row">
        <input className="ro-input" style={{ flex: 1, minWidth: 160 }} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={`输入宿主称呼「${name}」以确认`} aria-label="确认宿主称呼" />
        <button className="ro-btn ro-danger" disabled={busy || confirm.trim() !== name} onClick={() => void run(
          () => client.execute('DeleteHost', { confirmName: confirm }, hostId),
          '所有数据已删除。',
        )}>删除全部数据</button>
      </div>
    </>
  )
}

export function Audit({ dashboard }: { dashboard: Dashboard }) {
  const [open, setOpen] = useState(false)
  if (dashboard.audit.length === 0) return null
  return (
    <div className="ro-card" data-testid="reorigin-audit">
      <div className="ro-row ro-spread">
        <p className="ro-section-title">审计记录</p>
        <button className="ro-btn" onClick={() => setOpen(!open)}>{open ? '收起' : `查看最近 ${dashboard.audit.length} 条`}</button>
      </div>
      <p className="ro-muted" style={{ margin: '4px 0 0' }}>每一次状态变化都写入只追加的事件表，标明由宿主、Agent 还是系统引起。</p>
      {open && (
        <ul className="ro-feed">
          {dashboard.audit.map(event => (
            <li key={event.eventId} className="ro-audit">
              <span className="ro-muted ro-mono">{new Date(event.occurredAt).toLocaleString()}</span>
              <span className="ro-badge" data-tone={eventActor(event.causationId) === '宿主' ? 'muted' : 'accent'}>{eventActor(event.causationId)}</span>
              <span>{EVENT_LABEL[event.type] ?? event.type}{describeEvent(event.payload)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const VERDICT: Record<string, string> = { pass: '通过', needs_evidence: '需补证', reject: '驳回' }

function describeEvent(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ''
  const fields = payload as Record<string, unknown>
  const status = (value: string): string => STATUS[value as QuestStatus]?.label ?? value
  if (typeof fields.from === 'string' && typeof fields.to === 'string') return `：${status(fields.from)} → ${status(fields.to)}`
  if (typeof fields.reason === 'string') return `：${fields.reason}`
  if (typeof fields.title === 'string') return `：「${fields.title}」`
  if (typeof fields.name === 'string') return `：${fields.name}`
  if (typeof fields.skill === 'string') return `：${fields.skill}`
  if (typeof fields.verdict === 'string') return `：${VERDICT[fields.verdict] ?? fields.verdict}`
  if (typeof fields.amount === 'number') return `：${fields.amount > 0 ? '+' : ''}${fields.amount}`
  return ''
}
