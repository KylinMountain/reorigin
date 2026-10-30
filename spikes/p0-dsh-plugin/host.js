// Host half of the P0 spike: one Cordis service exposing a `reorigin` Remote
// namespace without DSH's typert generator. The Gateway falls back to SRC
// inference for endpoints with no strict definition, so a plain-JS service only
// needs the `typertRemote` binding plus the versioned method descriptor that
// `@Remote` would otherwise write onto the prototype.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'

const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

function statePath() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'reorigin', 'p0-state.json')
}

export default class ReOriginService extends Service {
  constructor(ctx) {
    super(ctx, 'reorigin')
    this.typertRemote = bindTypertRemote(this, 'reorigin', { namespace: 'reorigin' })
    console.log('[reorigin] host half loaded')
    ctx.effect(() => () => console.log('[reorigin] host half disposed'), 'reorigin: lifecycle log')
  }

  async getState() {
    try {
      return JSON.parse(await readFile(statePath(), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return { checks: 0, updatedAt: null }
      throw error
    }
  }

  async recordCheck(note) {
    const state = await this.getState()
    const next = { checks: state.checks + 1, updatedAt: new Date().toISOString(), lastNote: String(note) }
    const file = statePath()
    await mkdir(dirname(file), { recursive: true })
    await writeFile(`${file}.tmp`, JSON.stringify(next))
    await rename(`${file}.tmp`, file)
    return next
  }
}

Object.defineProperty(ReOriginService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      { method: 'getState', invocation: { kind: 'direct' } },
      { method: 'recordCheck', invocation: { kind: 'direct' } },
    ]),
  }),
})
