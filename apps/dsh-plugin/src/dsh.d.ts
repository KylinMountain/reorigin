// The slice of DeepSeek Harness APIs this plugin touches. Both halves resolve
// these modules from the running DSH installation (peer dependencies), so we
// declare only what we call instead of depending on DSH's pre-stable typings.
// Verified against deepseek-harness ce7073d; see docs/04-dsh-integration.md.

declare module '@deepseek-ai/cordis' {
  export interface Context {
    effect(execute: () => () => void, label?: string): void
    plugin(plugin: { name: string, inject: readonly string[], apply(ctx: Context): void }): void
    /** Present once the plugin injects `tools` (dsh-tools ToolRegistry). */
    tools: { register(definition: unknown): () => void }
    /** Present once the plugin injects `systemPrompt` (dsh-system-prompt). */
    systemPrompt: {
      section(section: { name: string, order: number, text: string | (() => string), interpolate?: boolean }): () => void
      context(context: { name: string, order: number, text: string | (() => string), interpolate?: boolean, required?: boolean }): () => void
    }
  }
  export abstract class Service {
    protected constructor(ctx: Context, name: string)
    readonly ctx: Context
  }
}

declare module '@deepseek-ai/dsh-tools' {
  /** Typed tool helper; validates model arguments against `parameters` before `execute`. */
  export function defineTool(definition: {
    name: string
    description: string
    parameters: Record<string, unknown>
    output: { schema: unknown, render: (args: never, value: never) => { type: 'text', text: string }[] }
    execute(args: never, exec: { callId: string, signal: AbortSignal }): Promise<unknown>
  }): unknown
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  export function bindTypertRemote<S extends object>(service: S, serviceKey: string, options?: { namespace?: string }): unknown
}
