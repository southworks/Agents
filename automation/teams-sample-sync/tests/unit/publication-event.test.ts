import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { publicationNumber, type PublicationEvent } from '../../src/publication-event.js'
import type { ReadApi } from '../../src/publication-issue.js'

const repository = 'example/Agents'
const event: PublicationEvent = {
  repository: { default_branch: 'main' },
  workflow_run: {
    name: 'Running Copilot cloud agent',
    event: 'dynamic',
    status: 'completed',
    head_branch: 'copilot/sample-sync',
    head_repository: { full_name: repository },
    pull_requests: [{ number: 56 }],
  },
}
const noApi: ReadApi = () => { throw new Error('Unexpected API call') }

describe('publication completion events', () => {
  it('resolves a completed run to its PR rather than the run starting commit', () => {
    assert.equal(publicationNumber(event, 'finalize', repository, noApi), 56)
  })

  it('supports manual recovery and rejects malformed PR numbers', () => {
    assert.equal(publicationNumber({ ...event, inputs: { finalize_pr_number: '56' } }, 'finalize', repository, noApi), 56)
    for (const number of ['0', '-1', '1.5', 'NaN', '9007199254740992']) {
      assert.throws(() => publicationNumber({ ...event, inputs: { finalize_pr_number: number } }, 'finalize', repository, noApi), /positive PR/)
    }
  })

  it('finds a PR by branch when the completion payload has no associated PRs', () => {
    const readApi: ReadApi = <T>(endpoint: string): T[] => {
      assert.equal(endpoint, 'repos/example/Agents/pulls?state=open&head=example%3Acopilot%2Fsample-sync&per_page=100')
      return [{ number: 56 }] as T[]
    }
    assert.equal(publicationNumber({
      ...event, workflow_run: { ...event.workflow_run!, pull_requests: [] },
    }, 'finalize', repository, readApi), 56)
  })

  it('ignores missing PRs and refuses ambiguous, foreign, or unfinished completion events', () => {
    assert.equal(publicationNumber({
      ...event, workflow_run: { ...event.workflow_run!, pull_requests: [] },
    }, 'finalize', repository, () => []), undefined)
    for (const override of [
      { status: 'in_progress' },
      { event: 'pull_request' },
      { head_repository: { full_name: 'other/Repo' } },
      { pull_requests: [{ number: 56 }, { number: 57 }] },
    ]) {
      assert.throws(() => publicationNumber({
        ...event, workflow_run: { ...event.workflow_run!, ...override },
      }, 'finalize', repository, noApi), /completed Copilot|multiple associated/)
    }
  })

  it('uses the PR event for verification', () => {
    assert.equal(publicationNumber({ ...event, pull_request: { number: 56 } }, 'verify', repository, noApi), 56)
    assert.throws(() => publicationNumber(event, 'verify', repository, noApi), /pull request event/)
  })
})
