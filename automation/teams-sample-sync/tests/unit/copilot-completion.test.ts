import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { copilotRuns, waitForCopilot, type CopilotRun } from '../../src/copilot-completion.js'
import type { PullRequest } from '../../src/publication-event.js'
import type { ReadApi } from '../../src/publication-issue.js'

const repository = 'example/Agents'
const pr: PullRequest = {
  number: 58,
  created_at: '2026-10-01T10:40:30Z',
  title: '[WIP] Sync Teams sample',
  body: 'Fixes #57',
  html_url: 'https://github.com/example/Agents/pull/58',
  state: 'open',
  draft: true,
  base: { sha: 'base', ref: 'main' },
  head: { sha: 'initial-plan', ref: 'copilot/sample-sync', repo: { full_name: repository } },
}
const run: CopilotRun = {
  id: 100,
  name: 'Running Copilot cloud agent',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-10-01T10:40:32Z',
  head_branch: pr.head.ref,
  pull_requests: [{ number: 58 }],
}

function api (runs: CopilotRun[]): ReadApi {
  return <T>(endpoint: string): T[] => {
    assert.equal(endpoint, 'repos/example/Agents/actions/runs?event=dynamic&branch=copilot%2Fsample-sync&per_page=100')
    return [{ workflow_runs: runs }] as T[]
  }
}

function clock () {
  let now = 0
  return {
    timeoutMs: 100,
    pollMs: 10,
    now: () => now,
    sleep: async (milliseconds: number) => { now += milliseconds },
    log: (_message: string) => {},
  }
}

describe('Copilot completion polling', () => {
  it('waits through run discovery and execution, then uses the final PR head and settled body', async () => {
    const settings = clock()
    const advance = settings.sleep
    const current = structuredClone(pr)
    let polls = 0
    const readApi: ReadApi = <T>(endpoint: string): T[] => {
      polls += 1
      const runs = polls === 1 ? [] : [{ ...run, status: polls < 4 ? 'in_progress' : 'completed' }]
      return api(runs)<T>(endpoint)
    }
    settings.sleep = async (milliseconds) => {
      await advance(milliseconds)
      if (polls === 3) {
        current.head.sha = 'final-head'
        current.body = 'Runtime final summary'
      }
      if (polls === 4) {
        current.body = 'Runtime metadata settled'
      }
    }
    const result = await waitForCopilot(repository, () => structuredClone(current), readApi, settings)
    assert.equal(result.head.sha, 'final-head')
    assert.equal(result.body, 'Runtime metadata settled')
    assert.equal(polls, 6)
  })

  it('does not confuse a previous PR session on a reused branch with the current session', async () => {
    const previous = { ...run, id: 99, pull_requests: [{ number: 56 }] }
    assert.deepEqual(copilotRuns(repository, pr, api([previous, run])), [run])
    await assert.rejects(waitForCopilot(repository, () => pr, api([previous]), clock()), /Timed out/)
    const unassociated = { ...run, pull_requests: [] }
    assert.deepEqual(copilotRuns(repository, pr, api([
      { ...unassociated, created_at: '2026-10-01T09:00:00Z' }, unassociated,
    ])), [unassociated])
  })

  it('waits for every active associated session and refuses failed completion or a timeout', async () => {
    await assert.rejects(waitForCopilot(repository, () => pr, api([
      run, { ...run, id: 99, status: 'in_progress', conclusion: null },
    ]), clock()), /Timed out/)
    await assert.rejects(waitForCopilot(repository, () => pr, api([
      { ...run, conclusion: 'failure' },
    ]), clock()), /did not succeed/)
    await assert.rejects(waitForCopilot(repository, () => pr, api([]), clock()), /Timed out/)
  })

  it('stops without waiting when the PR closes or its head moves outside the repository', async () => {
    const noApi: ReadApi = () => { assert.fail('No polling should be needed') }
    for (const current of [
      { ...pr, state: 'closed' },
      { ...pr, head: { ...pr.head, repo: null } },
    ]) {
      assert.equal(await waitForCopilot(repository, () => current, noApi, clock()), current)
    }
  })
})
