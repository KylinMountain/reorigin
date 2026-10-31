import type { CommandOutcome, CommandType, Dashboard, DataExport, Result } from '@reorigin/application'
import type { AgentStatus } from '../host/agent.ts'
import { REMOTE_NAMESPACE, type RemoteMethod } from '../shared/remote.ts'

export type { AgentStatus }

/** DSH's Connection RPC as the browser half sees it (`ctx.connection.rpc`). */
export interface Rpc {
  call(channel: '/api', endpoint: string, payload: { args: Record<string, unknown> }, signal?: AbortSignal): Promise<
    { ok: true, value: unknown } | { ok: false, error: { code: string, message: string } }
  >
}

export class RemoteFailure extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export class ReOriginClient {
  private readonly rpc: Rpc

  constructor(rpc: Rpc) {
    this.rpc = rpc
  }

  async dashboard(): Promise<Dashboard> {
    return await this.call('dashboard', {}) as Dashboard
  }

  async syncNow(): Promise<unknown> {
    return await this.call('syncNow', {})
  }

  async exportData(): Promise<DataExport> {
    return await this.call('exportData', {}) as DataExport
  }

  async agentStatus(): Promise<AgentStatus> {
    return await this.call('agentStatus', {}) as AgentStatus
  }

  /** Send one command; the Host fills in `actor`. Throws RemoteFailure for transport or domain refusals. */
  async execute(type: CommandType, payload: object, hostId?: string): Promise<CommandOutcome> {
    const command = {
      commandId: crypto.randomUUID(),
      issuedAt: new Date().toISOString(),
      schemaVersion: 1,
      type,
      payload,
      ...(hostId === undefined ? {} : { hostId }),
    }
    const result = await this.call('execute', { command }) as Result<CommandOutcome>
    if (!result.ok) throw new RemoteFailure(result.error.code, result.error.message)
    return result.value
  }

  private async call(method: RemoteMethod, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.rpc.call('/api', `${REMOTE_NAMESPACE}/${method}`, { args })
    if (!result.ok) throw new RemoteFailure(result.error.code, result.error.message)
    return result.value
  }
}
