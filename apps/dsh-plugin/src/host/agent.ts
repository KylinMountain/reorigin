// Agent integration: the model-facing proposal tool and the System persona.
// Mounted as a child plugin of the service so it waits for DSH's `tools` and
// `systemPrompt` services and unloads with it.
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ReOriginApp } from '@reorigin/application'
import { LIST_REVIEW_TOOL, NOTE_REVIEW_TOOL, PERSONA, TOOL_NAME, TOOL_PARAMETERS, describeNote, describeProposal, formatBrief, formatReviewable, toProposalPayload, type ToolArgs } from './persona.ts'

/** Host-plane orders: the persona after first-party guidance, before the deployment suffix (10200). */
const PERSONA_ORDER = 10100
const STATE_ORDER = 900

/** Whether the agent integration is live, as the panel reports it. */
export interface AgentStatus {
  readonly connected: boolean
  /** The proposal tool is in DSH's global tool registry, which every agent's view merges. */
  readonly toolRegistered: boolean
  readonly toolName: string
}

/** Tracks the mounted child plugin's context so the service can report status. */
export class AgentLink {
  private ctx: Context | undefined

  attach(ctx: Context): () => void {
    this.ctx = ctx
    return () => { if (this.ctx === ctx) this.ctx = undefined }
  }

  status(): AgentStatus {
    const tools = this.ctx?.tools as { get?(name: string): unknown } | undefined
    return { connected: this.ctx !== undefined, toolRegistered: tools?.get?.(TOOL_NAME) !== undefined, toolName: TOOL_NAME }
  }
}

export function agentPlugin(app: ReOriginApp, link: AgentLink) {
  return {
    name: 'reorigin-agent',
    inject: ['tools', 'systemPrompt'],
    apply(ctx: Context) {
      ctx.effect(() => link.attach(ctx), 'reorigin: agent link')
      // interpolate: false — host-written titles must never be read as {{variables}}.
      ctx.effect(() => ctx.systemPrompt.section({ name: 'reorigin:persona', order: PERSONA_ORDER, text: PERSONA, interpolate: false }), 'reorigin: persona')
      ctx.effect(() => ctx.systemPrompt.context({
        name: 'reorigin:host-state',
        order: STATE_ORDER,
        text: () => formatBrief(app.agentBrief()),
        interpolate: false,
      }), 'reorigin: host state')
      ctx.effect(() => ctx.tools.register(defineTool({
        name: TOOL_NAME,
        description: 'Propose one real-world quest to the user\'s Re:Origin growth System. The proposal waits in the user\'s Re:Origin panel until they accept it; you cannot accept, complete, verify, or reward quests.',
        parameters: TOOL_PARAMETERS,
        output: {
          schema: { type: 'string' },
          render: (_args: never, value: string) => [{ type: 'text', text: value }],
        },
        async execute(args: ToolArgs, exec) {
          return describeProposal(app.proposeFromAgent(exec.callId, toProposalPayload(args)))
        },
      })), 'reorigin: propose tool')
      // Review tools see only quests the Host opened per quest; everything else stays out of the model's reach.
      ctx.effect(() => ctx.tools.register(defineTool({
        name: LIST_REVIEW_TOOL,
        description: 'List the quests the user explicitly opened for your review in Re:Origin, with their acceptance criteria, submitted evidence, and the deterministic verdict. Call only when the user asks you to review a submission.',
        parameters: {},
        output: {
          schema: { type: 'string' },
          render: (_args: never, value: string) => [{ type: 'text', text: value }],
        },
        async execute() {
          return formatReviewable(app.reviewableSubmissions())
        },
      })), 'reorigin: list reviewable tool')
      ctx.effect(() => ctx.tools.register(defineTool({
        name: NOTE_REVIEW_TOOL,
        description: 'Leave one advisory note on a quest the user opened for review. Notes are shown to the user; they never change the verification verdict or rewards.',
        parameters: {
          quest_id: { type: 'string', required: true, description: 'Quest id from the review list.' },
          note: { type: 'string', required: true, description: 'Your comment in the user\'s language, at most 500 characters.' },
        },
        output: {
          schema: { type: 'string' },
          render: (_args: never, value: string) => [{ type: 'text', text: value }],
        },
        async execute(args: { quest_id: string, note: string }, exec) {
          return describeNote(app.annotateFromAgent(exec.callId, args.quest_id, args.note))
        },
      })), 'reorigin: review note tool')
    },
  }
}
