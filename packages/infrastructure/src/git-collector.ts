import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface RawCommit {
  readonly sha: string
  readonly committedAt: string
  readonly subject: string
  readonly filesChanged: number
}

const FIELD = '\x1f'
const RECORD = '\x1e'

/** Confirm a path is a git work tree before the Host can authorize it. */
export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const { stdout } = await run('git', ['-C', path, 'rev-parse', '--is-inside-work-tree'], { timeout: 10_000 })
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Read the consented author's commits since `since`. Only SHA, commit time,
 * subject, and a changed-file count leave this function; the author filter is
 * re-applied on the exact address because `git log --author` is a regex.
 */
export async function readCommits(input: { repo: string, author: string, since: string, limit?: number }): Promise<RawCommit[]> {
  const email = input.author.toLowerCase()
  const { stdout } = await run('git', [
    '-C', input.repo,
    'log',
    `--author=${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    `--since=${input.since}`,
    '--no-merges',
    `-n`, String(input.limit ?? 200),
    `--pretty=format:${RECORD}%H${FIELD}%ae${FIELD}%cI${FIELD}%s`,
    '--shortstat',
  ], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 })
  const commits: RawCommit[] = []
  for (const chunk of stdout.split(RECORD)) {
    if (chunk.trim() === '') continue
    const [header = '', ...rest] = chunk.split('\n')
    const [sha = '', author = '', committedAt = '', subject = ''] = header.split(FIELD)
    if (author.toLowerCase() !== email) continue
    const stat = rest.join(' ').match(/(\d+) files? changed/)
    commits.push({ sha, committedAt, subject, filesChanged: stat === null ? 0 : Number(stat[1]) })
  }
  return commits
}
