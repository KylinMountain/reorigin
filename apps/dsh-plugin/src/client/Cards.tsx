// Secondary panel cards: notices, growth tracks, memories, and System settings
// (consented data sources and how proactive the System may be).
import { useState, type FormEvent } from 'react'
import type { Dashboard } from '@reorigin/application'
import { setVoiceEnabled, voiceEnabled } from './Overlays.tsx'
import { relativeTime, type Ctx } from './shared.ts'

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
  return (
    <div className="ro-card" data-testid="reorigin-growth">
      <p className="ro-section-title">成长轨迹</p>
      <p className="ro-muted" style={{ margin: '4px 0 10px' }}>按任务标签统计「经核验完成」的次数，不代表技能熟练度评估。</p>
      {dashboard.growth.map(track => (
        <div key={track.skill} className="ro-track">
          <span className="ro-track-name">{track.skill}</span>
          <div className="ro-bar"><span style={{ width: `${(track.completions / max) * 100}%` }} /></div>
          <span className="ro-muted ro-mono">×{track.completions} · {track.xp} XP</span>
        </div>
      ))}
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

      <p className="ro-section-title">主动程度</p>
      <label className="ro-inline"><input type="checkbox" checked={quiet} onChange={e => setQuiet(e.target.checked)} />免打扰时段内不生成提醒和系统任务</label>
      <div className="ro-grid2">
        <label>免打扰开始<select className="ro-input" value={start} disabled={!quiet} onChange={e => setStart(Number(e.target.value))}>{hours.map(hour => <option key={hour} value={hour}>{hour}:00</option>)}</select></label>
        <label>免打扰结束<select className="ro-input" value={end} disabled={!quiet} onChange={e => setEnd(Number(e.target.value))}>{hours.map(hour => <option key={hour} value={hour}>{hour}:00</option>)}</select></label>
        <label>每天最多系统任务<select className="ro-input" value={perDay} onChange={e => setPerDay(Number(e.target.value))}>{[0, 1, 2, 3].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
      </div>
      <label className="ro-inline"><input type="checkbox" checked={voice} onChange={e => { setVoiceEnabled(e.target.checked); setVoice(e.target.checked) }} />系统播报：觉醒与升级时朗读（仅本浏览器）</label>
      <div className="ro-row">
        <button className="ro-btn" data-primary disabled={busy} onClick={() => void run(
          () => client.execute('UpdatePreferences', { quietHours: quiet ? { start, end } : null, systemProposalsPerDay: perDay }, hostId),
          '设置已保存。',
        )}>保存主动程度</button>
        <button className="ro-btn" disabled={busy} onClick={() => void run(() => client.syncNow(), '已与授权数据源同步。')}>立即同步</button>
      </div>
    </div>
  )
}
