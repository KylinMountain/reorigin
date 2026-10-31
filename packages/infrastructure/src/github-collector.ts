import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface RawPullRequest {
  readonly number: number
  readonly title: string
  readonly mergedAt: string
}

interface ApiPull {
  readonly number: number
  readonly title: string
  readonly merged_at: string | null
  readonly user: { readonly login: string } | null
}

/**
 * GET a GitHub REST path. Prefers the Host's own `gh` session (private repos,
 * higher rate limits); falls back to the unauthenticated public API.
 */
async function getJson(path: string): Promise<unknown> {
  try {
    const { stdout } = await run('gh', ['api', '--method', 'GET', path], { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 })
    return JSON.parse(stdout)
  } catch (error) {
    if ((error as { code?: unknown }).code !== 'ENOENT' && !String((error as Error).message).includes('gh auth login')) throw error
  }
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'reorigin-collector' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`GitHub ${response.status} for ${path}`)
  return await response.json()
}

/** Confirm a repository is reachable before the Host can authorize it. */
export async function isGithubRepository(slug: string): Promise<boolean> {
  try {
    const repo = await getJson(`repos/${slug}`) as { full_name?: unknown }
    return typeof repo.full_name === 'string'
  } catch {
    return false
  }
}

/**
 * Pull requests the consented author merged since `since`. Only the number,
 * title, and merge time leave this function: never bodies, reviews, or diffs.
 */
export async function readMergedPulls(input: { slug: string, author: string, since: string }): Promise<RawPullRequest[]> {
  const pulls = await getJson(`repos/${input.slug}/pulls?state=closed&sort=updated&direction=desc&per_page=50`) as ApiPull[]
  const author = input.author.toLowerCase()
  const since = Date.parse(input.since)
  return pulls
    .filter(pull => pull.merged_at !== null && pull.user?.login.toLowerCase() === author && Date.parse(pull.merged_at) >= since)
    .map(pull => ({ number: pull.number, title: pull.title, mergedAt: pull.merged_at! }))
}
