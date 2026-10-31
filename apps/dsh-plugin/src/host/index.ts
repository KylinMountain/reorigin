// Host half: owns the SQLite store and exposes the Application layer to the
// browser as the `reorigin` Remote namespace. There is no typert generation for
// out-of-tree packages, so the Gateway reaches these methods through its SRC
// fallback (docs/04-dsh-integration.md); SRC matches arguments by parameter
// name and checks only JSON-safety, which is why `execute` re-validates the
// whole command through the Application's schema.
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'
import { ReOriginApp, type CommandOutcome, type Dashboard, type DataExport, type Result, type TickReport } from '@reorigin/application'
import { SqliteStore, isGitRepository, isGithubRepository, readMergedPulls, randomIds, readCommits, systemClock } from '@reorigin/infrastructure'
import { githubSlug } from '@reorigin/domain'
import { REMOTE_METHODS, REMOTE_NAMESPACE } from '../shared/remote.ts'
import { AgentLink, agentPlugin, type AgentStatus } from './agent.ts'

/** Stable string key `@Remote` writes onto a service prototype (typert-protocol descriptor v1). */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** How often the System collects from consented sources and runs its rules. */
const HEARTBEAT_MS = 60_000
/** Collection window; older commits are irrelevant to the weekly rules and already deduped if seen. */
const COLLECT_WINDOW_DAYS = 30

export function databasePath(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'reorigin', 'reorigin.db')
}

export default class ReOriginService extends Service {
  readonly typertRemote: unknown
  private readonly app: ReOriginApp
  private readonly store: SqliteStore
  private readonly agentLink = new AgentLink()

  constructor(ctx: Context) {
    super(ctx, 'reorigin')
    this.typertRemote = bindTypertRemote(this, 'reorigin', { namespace: REMOTE_NAMESPACE })
    const path = databasePath()
    mkdirSync(join(path, '..'), { recursive: true })
    const store = new SqliteStore(path)
    this.store = store
    this.app = new ReOriginApp({ store, clock: systemClock, ids: randomIds })
    ctx.effect(() => () => store.close(), 'reorigin: close store')
    // Waits for DSH's tools and systemPrompt services; a profile without an agent plane just never mounts it.
    ctx.plugin(agentPlugin(this.app, this.agentLink))
    ctx.effect(() => {
      const beat = (): void => { void this.syncNow().catch(error => console.warn('[reorigin] heartbeat failed:', error)) }
      const first = setTimeout(beat, 3_000)
      const timer = setInterval(beat, HEARTBEAT_MS)
      return () => {
        clearTimeout(first)
        clearInterval(timer)
      }
    }, 'reorigin: heartbeat')
  }

  dashboard(): Dashboard {
    return this.app.dashboard()
  }

  exportData(): DataExport {
    return this.app.exportData()
  }

  /** Restore an export into an empty installation. */
  importData(document: unknown): Result<{ rows: number }> {
    const result = this.app.importData(document)
    if (result.ok) this.store.checkpoint()
    return result
  }

  agentStatus(): AgentStatus {
    return this.agentLink.status()
  }

  /** The browser speaks for the Host, never for an agent or the system, whatever it claims. */
  async execute(command: unknown): Promise<Result<CommandOutcome>> {
    const asHost = typeof command === 'object' && command !== null ? { ...command, actor: 'host' } as Record<string, unknown> : command
    // A grant must point at something real; checked here because the Application layer cannot reach git or GitHub.
    if (isObject(asHost) && asHost.type === 'GrantConsent' && isObject(asHost.payload)) {
      const { source, scopeRef } = asHost.payload
      const slug = typeof scopeRef === 'string' ? githubSlug(scopeRef) : null
      const reachable = source === 'github_repo'
        ? slug !== null && await isGithubRepository(slug)
        : typeof scopeRef === 'string' && await isGitRepository(scopeRef)
      if (!reachable) return { ok: false, error: { code: 'command/invalid', message: `cannot reach ${String(source)} ${String(scopeRef)}` } }
    }
    const result = this.app.execute(asHost)
    // Erased rows must not survive in the write-ahead log either.
    if (result.ok && result.value.type === 'DeleteHost') this.store.checkpoint()
    // Grants and revocations change what the System sees; reflect them right away.
    if (result.ok && (result.value.type === 'GrantConsent' || result.value.type === 'SettleQuest')) await this.syncNow()
    return result
  }

  /** Collect from every active consent, then run the System's rules and outbox. */
  async syncNow(): Promise<TickReport & { collected: number }> {
    let collected = 0
    const since = new Date(Date.now() - COLLECT_WINDOW_DAYS * 86_400_000).toISOString()
    for (const consent of this.app.activeConsents()) {
      try {
        const result = consent.source === 'github_repo'
          ? this.app.ingestPullRequests(consent.id, await readMergedPulls({ slug: consent.scopeRef, author: consent.author, since }))
          : this.app.ingestCommits(consent.id, await readCommits({ repo: consent.scopeRef, author: consent.author, since }))
        if (result.ok) collected += result.value.added
      } catch (error) {
        console.warn(`[reorigin] collecting ${consent.scopeRef} failed:`, error)
      }
    }
    return { ...this.app.tick(), collected }
  }
}

Object.defineProperty(ReOriginService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  value: Object.freeze({
    version: 1,
    methods: Object.freeze(REMOTE_METHODS.map(method => Object.freeze({ method, invocation: { kind: 'direct' } }))),
  }),
})

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
