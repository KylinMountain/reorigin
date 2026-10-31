import { DomainError } from './errors.ts'
import type { PersonaStyle } from './narrative.ts'

/**
 * P3 · World. Only sources the Host explicitly granted are observed (docs/02),
 * and only a privacy-filtered projection is kept: for a git repository that is
 * the commit SHA, a truncated subject line, its timestamp, and a file count —
 * never diffs or file names.
 */
export const WORLD_SOURCES = ['git_repo', 'github_repo'] as const
export type WorldSource = (typeof WORLD_SOURCES)[number]

export interface Consent {
  readonly id: string
  readonly hostId: string
  readonly source: WorldSource
  /** What the grant covers: for `git_repo` the absolute repository path, for `github_repo` "owner/name". */
  readonly scopeRef: string
  /** Only this author's activity is collected: a commit email for `git_repo`, a GitHub login for `github_repo`. */
  readonly author: string
  readonly status: 'active' | 'revoked'
  readonly grantedAt: string
  readonly revokedAt: string | null
}

export interface WorldEvent {
  readonly id: string
  readonly hostId: string
  readonly consentId: string
  readonly source: WorldSource
  /** Source-native id; (consent, externalId) is unique, which is the dedupe. */
  readonly externalId: string
  /** Time the source recorded, not when we collected it. */
  readonly observedAt: string
  readonly summary: string
  readonly filesChanged: number
}

export const MAX_SUMMARY = 120

/** Apply the privacy projection to one raw commit before anything is stored. */
export function filterCommit(raw: { sha: string, committedAt: string, subject: string, filesChanged: number }): Pick<WorldEvent, 'externalId' | 'observedAt' | 'summary' | 'filesChanged'> {
  if (!/^[0-9a-f]{7,64}$/.test(raw.sha)) throw new DomainError('world/invalid', `not a commit sha: ${raw.sha}`)
  const observed = Date.parse(raw.committedAt)
  if (Number.isNaN(observed)) throw new DomainError('world/invalid', `bad commit time for ${raw.sha}`)
  return {
    externalId: raw.sha,
    observedAt: new Date(observed).toISOString(),
    summary: truncate(raw.subject),
    filesChanged: Math.max(0, Math.trunc(raw.filesChanged)),
  }
}

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_SUMMARY ? `${flat.slice(0, MAX_SUMMARY - 1)}…` : flat
}

/** A GitHub repository slug as the Host types it, normalized; null when it is not one. */
export function githubSlug(input: string): string | null {
  const slug = input.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/+$/, '').replace(/\.git$/i, '')
  return /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(slug) ? slug.toLowerCase() : null
}

/**
 * Privacy projection of a merged pull request: number, title, and merge time.
 * The body, reviews, diff, and file names are never read.
 */
export function filterPullRequest(raw: { number: number, title: string, mergedAt: string, changedFiles?: number }): Pick<WorldEvent, 'externalId' | 'observedAt' | 'summary' | 'filesChanged'> {
  if (!Number.isSafeInteger(raw.number) || raw.number < 1) throw new DomainError('world/invalid', `not a pull request number: ${raw.number}`)
  const observed = Date.parse(raw.mergedAt)
  if (Number.isNaN(observed)) throw new DomainError('world/invalid', `bad merge time for #${raw.number}`)
  return { externalId: `pr:${raw.number}`, observedAt: new Date(observed).toISOString(), summary: truncate(raw.title), filesChanged: Math.max(0, Math.trunc(raw.changedFiles ?? 0)) }
}

/**
 * What a GitHub link points at, so link evidence can be checked against a
 * consented source: a pull request of a repository, or a commit SHA.
 */
export type GithubLink =
  | { readonly kind: 'pull', readonly slug: string, readonly number: number }
  | { readonly kind: 'commit', readonly slug: string, readonly sha: string }

export function parseGithubLink(url: string): GithubLink | null {
  const match = url.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100})\/(pull|commit)\/([0-9a-fA-F]+)(?:[/?#].*)?$/)
  if (match === null) return null
  const slug = match[1]!.toLowerCase()
  if (match[2] === 'pull') {
    const number = Number(match[3])
    return Number.isSafeInteger(number) && number > 0 && /^\d+$/.test(match[3]!) ? { kind: 'pull', slug, number } : null
  }
  return /^[0-9a-fA-F]{7,64}$/.test(match[3]!) ? { kind: 'commit', slug, sha: match[3]!.toLowerCase() } : null
}

/** Host preferences that bound how proactive the System may be. */
export interface Preferences {
  /** Local hours [start, end) during which no proactive notice or proposal is generated; null disables. */
  readonly quietHours: { readonly start: number, readonly end: number } | null
  /** Upper bound on System-generated quest proposals per local day. */
  readonly systemProposalsPerDay: number
  /** The System's voice in conversations. */
  readonly persona: PersonaStyle
  /** IANA zone for quiet hours and daily caps; null follows the Host machine's clock. */
  readonly timeZone: string | null
}

export const DEFAULT_PREFERENCES: Preferences = { quietHours: { start: 23, end: 8 }, systemProposalsPerDay: 1, persona: 'calm', timeZone: null }

/** Whether the runtime knows this IANA time zone. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export function inQuietHours(localHour: number, preferences: Pick<Preferences, 'quietHours'>): boolean {
  const quiet = preferences.quietHours
  if (quiet === null || quiet.start === quiet.end) return false
  return quiet.start < quiet.end
    ? localHour >= quiet.start && localHour < quiet.end
    : localHour >= quiet.start || localHour < quiet.end
}

/** Bump when the rules below change; stored on what they produce. */
export const WORLD_RULE_VERSION = 'world-v1'

export interface ProposalCandidate {
  /** Dedupe key: the same opportunity is never proposed twice. */
  readonly sourceKey: string
  readonly title: string
  readonly objective: string
  readonly rationale: string
  readonly xp: number
  readonly minCommits: number
  readonly expiresInDays: number
}

export interface NudgeCandidate {
  readonly sourceKey: string
  readonly title: string
  readonly body: string
}

const DAY = 86_400_000

/**
 * Deterministic opportunity rules over the last week of observed commits.
 * `localDay` maps an ISO time to the Host's local calendar day (YYYY-MM-DD).
 */
export function detectOpportunities(input: {
  now: string
  events: readonly WorldEvent[]
  hasGoals: boolean
  localDay: (iso: string) => string
}): { proposals: ProposalCandidate[], nudges: NudgeCandidate[] } {
  const now = Date.parse(input.now)
  const week = input.events.filter(event => now - Date.parse(event.observedAt) <= 7 * DAY && Date.parse(event.observedAt) <= now)
  const days = new Set(week.map(event => input.localDay(event.observedAt)))
  const proposals: ProposalCandidate[] = []
  const nudges: NudgeCandidate[] = []
  const today = input.localDay(input.now)

  // streak: three or more active days this week → a hidden quest to keep the rhythm.
  if (days.size >= 3) {
    const latestDay = [...days].sort().at(-1)!
    proposals.push({
      sourceKey: `${WORLD_RULE_VERSION}:streak:${latestDay}`,
      title: '节奏守护者',
      objective: '接下来 3 天里，每天至少完成一次有意义的提交。',
      rationale: `系统在已授权仓库中观测到你最近 7 天有 ${days.size} 天在提交，节奏正在形成。`,
      xp: 90,
      minCommits: 3,
      expiresInDays: 4,
    })
  }

  // idle: goals declared but no commit for three days → one gentle nudge per day.
  const latest = week.reduce((max, event) => Math.max(max, Date.parse(event.observedAt)), Number.NEGATIVE_INFINITY)
  if (input.hasGoals && (latest === Number.NEGATIVE_INFINITY || now - latest >= 3 * DAY)) {
    nudges.push({
      sourceKey: `${WORLD_RULE_VERSION}:idle:${today}`,
      title: '【系统提示】主线停滞',
      body: '已授权仓库中连续 3 天没有新的提交。今天推进一小步也算数。',
    })
  }
  return { proposals, nudges }
}
