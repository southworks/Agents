import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findPublicationIssue, type PublicationIssue, type ReadApi } from '../../src/publication-issue.js'

const repository = 'example/Agents'
const prUrl = 'https://github.com/example/Agents/pull/100'
const issue: PublicationIssue = {
  number: 42,
  body: `Prepared handoff.\n<!-- teams-sample-sync-handoff:sha256:${'a'.repeat(64)} -->`,
}

function api (responses: Record<string, unknown[]>): ReadApi {
  return <T>(endpoint: string): T[] => {
    assert.ok(endpoint in responses, `Unexpected API request: ${endpoint}`)
    return responses[endpoint] as T[]
  }
}

describe('publication issue lookup', () => {
  it('uses a referenced handoff without scanning unrelated issues', () => {
    const readApi = api({ [`repos/${repository}/issues/42`]: [issue] })
    assert.equal(findPublicationIssue(repository, 100, 'Fixes #42', prUrl, readApi), issue)
  })

  it('finds the recorded association after the PR description and title are rewritten', () => {
    const readApi = api({
      [`repos/${repository}/issues?state=all&per_page=100`]: [issue],
      [`repos/${repository}/issues/42/timeline?per_page=100`]: [
        { event: 'cross-referenced', source: { issue: { number: 100, html_url: prUrl } } },
      ],
    })
    assert.equal(findPublicationIssue(repository, 100, 'Rewritten description', prUrl, readApi), issue)
  })

  it('does not confuse a matching PR number in another repository with this publication', () => {
    const readApi = api({
      [`repos/${repository}/issues?state=all&per_page=100`]: [issue],
      [`repos/${repository}/issues/42/timeline?per_page=100`]: [
        { event: 'cross-referenced', source: { issue: { number: 100, html_url: 'https://github.com/other/Repo/pull/100' } } },
      ],
    })
    assert.equal(findPublicationIssue(repository, 100, '', prUrl, readApi), undefined)
  })

  it('leaves ordinary issue-linked PRs outside the sync publication checks', () => {
    const readApi = api({
      [`repos/${repository}/issues/7`]: [{ number: 7, body: 'Ordinary task' }],
      [`repos/${repository}/issues?state=all&per_page=100`]: [],
    })
    assert.equal(findPublicationIssue(repository, 100, 'Fixes #7', prUrl, readApi), undefined)
  })

  it('ignores nonexistent issue references but does not hide API permission failures', () => {
    const missing: ReadApi = <T>(endpoint: string): T[] => {
      if (endpoint.endsWith('/issues/999999')) {
        throw new Error('gh: Not Found (HTTP 404)')
      }
      return []
    }
    assert.equal(findPublicationIssue(repository, 100, 'Example: Fixes #999999', prUrl, missing), undefined)
    const denied: ReadApi = () => {
      throw new Error('gh: Resource not accessible (HTTP 403)')
    }
    assert.throws(() => findPublicationIssue(repository, 100, 'Fixes #42', prUrl, denied), /HTTP 403/)
  })
})
