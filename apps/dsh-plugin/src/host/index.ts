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
import { ReOriginApp, type CommandOutcome, type Dashboard, type Result } from '@reorigin/application'
import { SqliteStore, randomIds, systemClock } from '@reorigin/infrastructure'
import { REMOTE_METHODS, REMOTE_NAMESPACE } from '../shared/remote.ts'

/** Stable string key `@Remote` writes onto a service prototype (typert-protocol descriptor v1). */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

export function databasePath(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'reorigin', 'reorigin.db')
}

export default class ReOriginService extends Service {
  readonly typertRemote: unknown
  private readonly app: ReOriginApp

  constructor(ctx: Context) {
    super(ctx, 'reorigin')
    this.typertRemote = bindTypertRemote(this, 'reorigin', { namespace: REMOTE_NAMESPACE })
    const path = databasePath()
    mkdirSync(join(path, '..'), { recursive: true })
    const store = new SqliteStore(path)
    this.app = new ReOriginApp({ store, clock: systemClock, ids: randomIds })
    ctx.effect(() => () => store.close(), 'reorigin: close store')
  }

  dashboard(): Dashboard {
    return this.app.dashboard()
  }

  /** The browser speaks for the Host, never for an agent or the system, whatever it claims. */
  execute(command: unknown): Result<CommandOutcome> {
    const asHost = typeof command === 'object' && command !== null ? { ...command, actor: 'host' } : command
    return this.app.execute(asHost)
  }
}

Object.defineProperty(ReOriginService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  value: Object.freeze({
    version: 1,
    methods: Object.freeze(REMOTE_METHODS.map(method => Object.freeze({ method, invocation: { kind: 'direct' } }))),
  }),
})
