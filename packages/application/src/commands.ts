import { EVIDENCE_KINDS, MAX_DISPLAY_NAME, MAX_GOALS, MAX_XP_PER_QUEST, QUEST_TYPES } from '@reorigin/domain'
import { z } from 'zod'

/**
 * Wire schemas for every command. DSH's SRC Remote path only checks that
 * arguments are JSON-safe, so this is the one place untrusted input
 * (the browser, or an agent tool call) is validated.
 */

const isoTime = z.iso.datetime({ offset: true })
const id = z.string().min(1).max(64)

const envelope = {
  commandId: z.string().min(8).max(64),
  actor: z.enum(['host', 'agent', 'system']),
  issuedAt: isoTime,
  schemaVersion: z.literal(1),
}

const criterion = z.object({
  kind: z.enum(EVIDENCE_KINDS),
  minCount: z.int().min(1).max(20),
  description: z.string().min(1).max(200),
})

const evidenceInput = z.object({
  kind: z.enum(EVIDENCE_KINDS),
  ref: z.string().min(1).max(500),
  summary: z.string().max(1000).default(''),
  observedAt: isoTime,
  attested: z.boolean().default(false),
})

export const commandSchema = z.discriminatedUnion('type', [
  z.object({
    ...envelope,
    type: z.literal('BindHost'),
    payload: z.object({
      displayName: z.string().min(1).max(MAX_DISPLAY_NAME),
      goals: z.array(z.string().max(200)).max(MAX_GOALS).default([]),
    }),
  }),
  z.object({
    ...envelope,
    type: z.literal('ProposeQuest'),
    hostId: id,
    payload: z.object({
      type: z.enum(QUEST_TYPES),
      title: z.string().min(1).max(120),
      objective: z.string().max(1000).default(''),
      criteria: z.array(criterion).min(1).max(5),
      xp: z.int().min(0).max(MAX_XP_PER_QUEST),
    }),
  }),
  z.object({ ...envelope, type: z.literal('AcceptQuest'), hostId: id, payload: z.object({ questId: id }) }),
  z.object({ ...envelope, type: z.literal('CancelQuest'), hostId: id, payload: z.object({ questId: id }) }),
  z.object({
    ...envelope,
    type: z.literal('SubmitQuestEvidence'),
    hostId: id,
    payload: z.object({ questId: id, evidence: z.array(evidenceInput).min(1).max(10) }),
  }),
  z.object({ ...envelope, type: z.literal('VerifyQuest'), hostId: id, payload: z.object({ questId: id }) }),
  z.object({ ...envelope, type: z.literal('SettleQuest'), hostId: id, payload: z.object({ questId: id }) }),
])

export type Command = z.infer<typeof commandSchema>
export type CommandType = Command['type']
export type Actor = Command['actor']

/**
 * Who may issue what. An agent may only suggest quests (ADR-003): it can never
 * accept on the Host's behalf, submit evidence, or trigger a payout.
 */
export const ALLOWED_ACTORS: Readonly<Record<CommandType, readonly Actor[]>> = {
  BindHost: ['host'],
  ProposeQuest: ['host', 'agent', 'system'],
  AcceptQuest: ['host'],
  CancelQuest: ['host'],
  SubmitQuestEvidence: ['host'],
  VerifyQuest: ['host', 'system'],
  SettleQuest: ['host', 'system'],
}
