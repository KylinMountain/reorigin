// Passive discovery: the repositories the Host already works in, read from the
// working directories of their DSH sessions. Nothing is collected from a
// candidate until the Host grants it; this only saves them typing a path.
import type { Context } from '@deepseek-ai/cordis'
import type { Consent } from '@reorigin/domain'
import { githubLogin, probeWorkspace } from '@reorigin/infrastructure'

/** One repository the Host could grant with a click. */
export interface SourceCandidate {
  readonly path: string
  readonly author: string | null
  readonly githubSlug: string | null
  readonly sessions: number
  readonly lastActiveAt: string
  /** Already covered by an active grant, per source. */
  readonly granted: { readonly git_repo: boolean, readonly github_repo: boolean }
}

export interface Discovery {
  /** False when the composition has no session query service to read. */
  readonly available: boolean
  readonly candidates: readonly SourceCandidate[]
  readonly githubLogin: string | null
}

interface SessionQuery {
  listSessions(): Promise<readonly { header: { cwd?: string, createdAt: number, origin?: string } }[]>
}

const MAX_CANDIDATES = 8

/** Tracks the mounted child plugin's `sessionQuery` so the service can read it on demand. */
export class DiscoveryLink {
  private query: SessionQuery | undefined

  attach(query: SessionQuery): () => void {
    this.query = query
    return () => { if (this.query === query) this.query = undefined }
  }

  async discover(consents: readonly Consent[]): Promise<Discovery> {
    if (this.query === undefined) return { available: false, candidates: [], githubLogin: null }
    // Delegated subagent sessions run where their parent did; counting them would only inflate.
    const byCwd = new Map<string, { sessions: number, last: number }>()
    for (const { header } of await this.query.listSessions()) {
      if (header.cwd === undefined || header.origin === 'subagent') continue
      const seen = byCwd.get(header.cwd) ?? { sessions: 0, last: 0 }
      byCwd.set(header.cwd, { sessions: seen.sessions + 1, last: Math.max(seen.last, header.createdAt) })
    }
    const byRoot = new Map<string, Omit<SourceCandidate, 'granted' | 'lastActiveAt'> & { last: number }>()
    for (const [cwd, seen] of [...byCwd].sort((a, b) => b[1].last - a[1].last).slice(0, MAX_CANDIDATES * 3)) {
      const probe = await probeWorkspace(cwd)
      if (probe === null) continue
      const known = byRoot.get(probe.root)
      byRoot.set(probe.root, {
        path: probe.root,
        author: probe.author,
        githubSlug: probe.githubSlug,
        sessions: (known?.sessions ?? 0) + seen.sessions,
        last: Math.max(known?.last ?? 0, seen.last),
      })
    }
    const active = consents.filter(consent => consent.status === 'active')
    const candidates = [...byRoot.values()].sort((a, b) => b.last - a.last).slice(0, MAX_CANDIDATES).map(({ last, ...candidate }) => ({
      ...candidate,
      lastActiveAt: new Date(last).toISOString(),
      granted: {
        git_repo: active.some(consent => consent.source === 'git_repo' && consent.scopeRef === candidate.path),
        github_repo: active.some(consent => consent.source === 'github_repo' && consent.scopeRef === candidate.githubSlug),
      },
    }))
    const needsLogin = candidates.some(candidate => candidate.githubSlug !== null && !candidate.granted.github_repo)
    return { available: true, candidates, githubLogin: needsLogin ? await githubLogin() : null }
  }
}

export function discoveryPlugin(link: DiscoveryLink) {
  return {
    name: 'reorigin-discovery',
    inject: ['sessionQuery'],
    apply(ctx: Context) {
      ctx.effect(() => link.attach((ctx as unknown as { sessionQuery: SessionQuery }).sessionQuery), 'reorigin: discovery link')
    },
  }
}
