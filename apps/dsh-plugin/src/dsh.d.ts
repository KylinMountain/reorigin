// The slice of DeepSeek Harness APIs this plugin touches. Both halves resolve
// these modules from the running DSH installation (peer dependencies), so we
// declare only what we call instead of depending on DSH's pre-stable typings.
// Verified against deepseek-harness ce7073d; see docs/04-dsh-integration.md.

declare module '@deepseek-ai/cordis' {
  export interface Context {
    effect(execute: () => () => void, label?: string): void
  }
  export abstract class Service {
    protected constructor(ctx: Context, name: string)
    readonly ctx: Context
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  export function bindTypertRemote<S extends object>(service: S, serviceKey: string, options?: { namespace?: string }): unknown
}
