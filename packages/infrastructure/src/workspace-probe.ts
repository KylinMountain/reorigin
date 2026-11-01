import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { githubSlug } from '@reorigin/domain'

const run = promisify(execFile)

/** What a working directory offers as a source, read locally and never stored until the Host grants it. */
export interface WorkspaceProbe {
  /** The work tree root, so sessions in subdirectories collapse into one repository. */
  readonly root: string
  /** The commit author git would record here; the default scope of a grant. */
  readonly author: string | null
  /** `owner/repo` when `origin` points at GitHub. */
  readonly githubSlug: string | null
}

async function git(path: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['-C', path, ...args], { timeout: 10_000 })
    const value = stdout.trim()
    return value === '' ? null : value
  } catch {
    return null
  }
}

export async function probeWorkspace(path: string): Promise<WorkspaceProbe | null> {
  const root = await git(path, ['rev-parse', '--show-toplevel'])
  if (root === null) return null
  const [author, origin] = await Promise.all([git(root, ['config', 'user.email']), git(root, ['remote', 'get-url', 'origin'])])
  return { root, author, githubSlug: origin === null ? null : originSlug(origin) }
}

/** `owner/repo` from an HTTPS or SSH GitHub remote. */
export function originSlug(url: string): string | null {
  const ssh = url.trim().match(/^(?:ssh:\/\/)?git@github\.com[:/](.+)$/i)
  return githubSlug(ssh !== null ? ssh[1]! : url)
}

/** The login of the Host's own `gh` session, if there is one. */
export async function githubLogin(): Promise<string | null> {
  try {
    const { stdout } = await run('gh', ['api', 'user', '--jq', '.login'], { timeout: 10_000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}
