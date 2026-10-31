import { describe, expect, it } from 'vitest'
import { filterPullRequest, githubSlug, isTimeZone, parseGithubLink } from '../src/index.ts'

describe('GitHub source helpers', () => {
  it('normalizes repository slugs and rejects anything else', () => {
    expect(githubSlug('KylinMountain/reorigin')).toBe('kylinmountain/reorigin')
    expect(githubSlug('https://github.com/Owner/Repo.git/')).toBe('owner/repo')
    expect(['owner', 'a/b/c', '/abs/path', 'owner/re po'].map(githubSlug)).toEqual([null, null, null, null])
  })

  it('parses pull request and commit links, case-insensitively for the slug', () => {
    expect(parseGithubLink('https://github.com/Owner/Repo/pull/12')).toEqual({ kind: 'pull', slug: 'owner/repo', number: 12 })
    expect(parseGithubLink('https://github.com/o/r/pull/12/files#diff')).toEqual({ kind: 'pull', slug: 'o/r', number: 12 })
    expect(parseGithubLink('https://github.com/o/r/commit/ABCDEF1234')).toEqual({ kind: 'commit', slug: 'o/r', sha: 'abcdef1234' })
    expect(['https://github.com/o/r/issues/3', 'https://example.com/o/r/pull/3', 'https://github.com/o/r/pull/0x1', 'http://github.com/o/r/pull/3'].map(parseGithubLink))
      .toEqual([null, null, null, null])
  })

  it('keeps only number, title, and merge time of a pull request', () => {
    const filtered = filterPullRequest({ number: 7, title: `feat:  ${'x'.repeat(200)}`, mergedAt: '2026-10-30T10:00:00+08:00' })
    expect(filtered).toEqual({ externalId: 'pr:7', observedAt: '2026-10-30T02:00:00.000Z', summary: expect.stringMatching(/…$/), filesChanged: 0 })
    expect(filtered.summary.length).toBe(120)
    expect(() => filterPullRequest({ number: 0, title: 't', mergedAt: '2026-10-30T00:00:00Z' })).toThrow(expect.objectContaining({ code: 'world/invalid' }))
  })

  it('accepts only zones the runtime knows', () => {
    expect([isTimeZone('Asia/Shanghai'), isTimeZone('America/New_York'), isTimeZone('Mars/Olympus')]).toEqual([true, true, false])
  })
})
