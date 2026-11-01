// Data sources: what the System detected from the Host's DSH sessions (granted
// with one click), what is granted now, and a manual form for anything else.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Dashboard } from '@reorigin/application'
import type { Discovery, SourceCandidate } from './api.ts'
import { relativeTime, type Ctx } from './shared.ts'

/** Read the Host's recent DSH workspaces once per mount; refreshed after each grant. */
export function useDiscovery(client: Ctx['client']): [Discovery | null, () => void] {
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const refresh = useCallback(() => { client.discoverSources().then(setDiscovery, () => setDiscovery({ available: false, candidates: [], githubLogin: null })) }, [client])
  useEffect(refresh, [refresh])
  return [discovery, refresh]
}

/** Candidates still worth offering: some source of theirs is not granted yet. */
export function openCandidates(discovery: Discovery | null): SourceCandidate[] {
  return (discovery?.candidates ?? []).filter(candidate =>
    (!candidate.granted.git_repo && candidate.author !== null) || (candidate.githubSlug !== null && !candidate.granted.github_repo && discovery!.githubLogin !== null))
}

const basename = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path

export function Detected({ discovery, onGranted, compact = false, run, busy, client, hostId }: { discovery: Discovery | null, onGranted: () => void, compact?: boolean } & Ctx) {
  const candidates = openCandidates(discovery)
  if (discovery === null || !discovery.available || candidates.length === 0) return null
  const grant = (candidate: SourceCandidate) => void run(async () => {
    if (!candidate.granted.git_repo && candidate.author !== null) {
      await client.execute('GrantConsent', { source: 'git_repo', scopeRef: candidate.path, author: candidate.author }, hostId)
    }
    if (candidate.githubSlug !== null && !candidate.granted.github_repo && discovery.githubLogin !== null) {
      await client.execute('GrantConsent', { source: 'github_repo', scopeRef: candidate.githubSlug, author: discovery.githubLogin }, hostId)
    }
    onGranted()
  }, `已授权「${basename(candidate.path)}」。从现在起，你在这里的提交会自动计入进行中的任务。`)
  return (
    <section className="ro-card ro-detect" data-testid="reorigin-detected">
      <h2 className="ro-h">侦测到 {candidates.length} 个你常用的仓库</h2>
      <p className="ro-note">来自你在 DSH 里打开过的会话目录。授权之后，系统会在后台读取你自己的提交和合并的 PR，自动给任务取证，不用再手动填写。</p>
      <ul className="ro-detect-list">
        {(compact ? candidates.slice(0, 3) : candidates).map(candidate => (
          <li key={candidate.path}>
            <div className="ro-detect-name">
              <span className="ro-strong">{basename(candidate.path)}</span>
              <span className="ro-dim">{candidate.sessions} 次会话，最近 {relativeTime(candidate.lastActiveAt)}</span>
            </div>
            <div className="ro-detect-scope ro-dim">
              {candidate.author !== null && !candidate.granted.git_repo && <span>提交作者 {candidate.author}</span>}
              {candidate.githubSlug !== null && !candidate.granted.github_repo && discovery.githubLogin !== null && <span>GitHub {candidate.githubSlug}</span>}
            </div>
            <button className="ro-btn" data-primary disabled={busy} onClick={() => grant(candidate)}>授权</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Sources({ dashboard, discovery, onGranted, ...ctx }: { dashboard: Dashboard, discovery: Discovery | null, onGranted: () => void } & Ctx) {
  const { run, busy, client, hostId } = ctx
  const [manual, setManual] = useState(false)
  const [source, setSource] = useState<'git_repo' | 'github_repo'>('git_repo')
  const [repo, setRepo] = useState('')
  const [author, setAuthor] = useState('')
  const [deleteData, setDeleteData] = useState(true)
  const active = dashboard.consents.filter(consent => consent.status === 'active')
  const grant = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await client.execute('GrantConsent', { source, scopeRef: repo.trim(), author: author.trim() }, hostId)
      setRepo('')
      onGranted()
    }, source === 'github_repo'
      ? '已授权。系统只读取该仓库中这个账号合并的 PR：编号、标题与合并时间。'
      : '已授权。系统只读取该仓库中这个邮箱作者的提交：SHA、时间、标题与改动文件数。')
  }
  return (
    <>
      <Detected discovery={discovery} onGranted={onGranted} {...ctx} />
      <section className="ro-card" data-testid="reorigin-sources">
        <div className="ro-row ro-spread">
          <h2 className="ro-h">已授权的数据源</h2>
          <button className="ro-btn" disabled={busy} onClick={() => void run(() => client.syncNow(), '已与授权数据源同步。')}>立即同步</button>
        </div>
        <p className="ro-note">系统每分钟读取一次，只读你自己的提交（SHA、时间、标题、改动文件数）和你合并的 PR（编号、标题、合并时间），不读代码内容。</p>
        {dashboard.consents.length === 0 && <p className="ro-dim">还没有授权任何数据源。</p>}
        <ul className="ro-consents">
          {dashboard.consents.map(consent => (
            <li key={consent.id} data-active={consent.status === 'active'}>
              <span className="ro-tag" data-tone={consent.status === 'active' ? 'ok' : 'muted'}>{consent.status === 'active' ? '生效中' : '已撤销'}</span>
              <span className="ro-tag" data-tone="muted">{consent.source === 'github_repo' ? 'GitHub' : '本地仓库'}</span>
              <span className="ro-consent-ref" title={consent.scopeRef}>{consent.scopeRef}</span>
              <span className="ro-dim">{consent.author}</span>
              {consent.status === 'active' && (
                <button className="ro-btn ro-btn-quiet" disabled={busy} onClick={() => void run(
                  async () => { await client.execute('RevokeConsent', { consentId: consent.id, deleteData }, hostId); onGranted() },
                  deleteData ? '已撤销授权，并删除了从该来源采集的数据。' : '已撤销授权，系统不再采集该来源。',
                )}>撤销</button>
              )}
            </li>
          ))}
        </ul>
        {active.length > 0 && (
          <label className="ro-check"><input type="checkbox" checked={deleteData} onChange={e => setDeleteData(e.target.checked)} />撤销时同时删除已采集的数据</label>
        )}
        {!manual
          ? <button className="ro-link" onClick={() => setManual(true)}>手动添加其他仓库</button>
          : (
            <form className="ro-form" onSubmit={grant}>
              <div className="ro-grid2">
                <label>来源类型<select className="ro-input" value={source} onChange={e => setSource(e.target.value as 'git_repo' | 'github_repo')}>
                  <option value="git_repo">本地 Git 仓库</option>
                  <option value="github_repo">GitHub 仓库（合并的 PR）</option>
                </select></label>
                {source === 'git_repo'
                  ? <label>本地仓库绝对路径<input className="ro-input ro-mono" value={repo} onChange={e => setRepo(e.target.value)} placeholder="/Users/me/projects/app" required /></label>
                  : <label>GitHub 仓库<input className="ro-input ro-mono" value={repo} onChange={e => setRepo(e.target.value)} placeholder="owner/name" required /></label>}
                {source === 'git_repo'
                  ? <label>你的提交邮箱<input className="ro-input" type="email" value={author} onChange={e => setAuthor(e.target.value)} required /></label>
                  : <label>你的 GitHub 用户名<input className="ro-input" value={author} onChange={e => setAuthor(e.target.value)} required /></label>}
              </div>
              <div className="ro-row">
                <button className="ro-btn" data-primary type="submit" disabled={busy || repo.trim() === '' || author.trim() === ''}>授权该来源</button>
                <button className="ro-btn ro-btn-quiet" type="button" onClick={() => setManual(false)}>取消</button>
              </div>
            </form>
          )}
        {discovery !== null && !discovery.available && <p className="ro-dim">当前 DSH 组合没有提供会话查询服务，无法自动侦测仓库，只能手动添加。</p>}
      </section>
    </>
  )
}
