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
      rationale: z.string().max(500).default(''),
      criteria: z.array(criterion).min(1).max(5),
      xp: z.int().min(0).max(MAX_XP_PER_QUEST),
      /** Daily quests default to one day when omitted. */
      expiresInDays: z.int().min(1).max(90).optional(),
      skill: z.string().max(20).default(''),
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
  z.object({
    ...envelope,
    type: z.literal('GrantConsent'),
    hostId: id,
    payload: z.object({
      source: z.literal('git_repo'),
      scopeRef: z.string().min(2).max(1000).refine(path => path.startsWith('/'), 'must be an absolute path'),
      authorEmail: z.email(),
    }),
  }),
  z.object({
    ...envelope,
    type: z.literal('RevokeConsent'),
    hostId: id,
    payload: z.object({ consentId: id, deleteData: z.boolean().default(false) }),
  }),
  z.object({
    ...envelope,
    type: z.literal('UpdatePreferences'),
    hostId: id,
    payload: z.object({
      quietHours: z.object({ start: z.int().min(0).max(23), end: z.int().min(0).max(23) }).nullable(),
      systemProposalsPerDay: z.int().min(0).max(3),
    }),
  }),
  z.object({ ...envelope, type: z.literal('AddMemory'), hostId: id, payload: z.object({ text: z.string().min(1).max(300) }) }),
  z.object({ ...envelope, type: z.literal('ForgetMemory'), hostId: id, payload: z.object({ memoryId: id }) }),
  z.object({ ...envelope, type: z.literal('MarkNoticesRead'), hostId: id, payload: z.object({}) }),
  /** Display an unlocked title, or none with null. */
  z.object({ ...envelope, type: z.literal('EquipTitle'), hostId: id, payload: z.object({ titleKey: z.string().min(1).max(80).nullable() }) }),
])

export type Command = z.infer<typeof commandSchema>
export type CommandType = Command['type']
export type Actor = Command['actor']

/** Agent proposals are suggestions, not grants: smaller rewards and a bounded review queue. */
export const AGENT_MAX_XP = 200
export const AGENT_MAX_PENDING_PROPOSALS = 3

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
  // What the System may observe and remember is the Host's call alone.
  GrantConsent: ['host'],
  RevokeConsent: ['host'],
  UpdatePreferences: ['host'],
  AddMemory: ['host'],
  ForgetMemory: ['host'],
  MarkNoticesRead: ['host'],
  EquipTitle: ['host'],
}
