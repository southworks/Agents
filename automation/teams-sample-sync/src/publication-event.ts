/** Resolves the current PR from a completion event or manual recovery input. */
import type { ReadApi } from './publication-issue.js'

export interface PullRequest {
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  draft: boolean
  base: { sha: string; ref: string }
  head: { sha: string; ref: string; repo: { full_name: string } | null }
}

export interface PublicationEvent {
  repository: { default_branch: string }
  inputs?: { finalize_pr?: string }
  pull_request?: { number: number }
  workflow_run?: {
    name: string
    event: string
    status: string
    head_branch: string
    head_repository: { full_name: string } | null
    pull_requests: Array<{ number: number }>
  }
}

export function publicationNumber (
  event: PublicationEvent,
  mode: 'verify' | 'finalize',
  repository: string,
  readApi: ReadApi
): number | undefined {
  if (mode === 'verify') {
    if (!event.pull_request) {
      throw new Error('Verification requires a pull request event')
    }
    return event.pull_request.number
  }
  if (event.inputs?.finalize_pr) {
    const number = Number(event.inputs.finalize_pr)
    if (!/^\d+$/.test(event.inputs.finalize_pr) || !Number.isSafeInteger(number) || number < 1) {
      throw new Error('Manual finalization requires a positive PR number')
    }
    return number
  }
  const run = event.workflow_run
  if (!run || run.name !== 'Running Copilot cloud agent' || run.event !== 'dynamic' || run.status !== 'completed' ||
    run.head_repository?.full_name !== repository) {
    throw new Error('Finalization requires a completed Copilot run from this repository')
  }
  const numbers = run.pull_requests.map((pr) => pr.number)
  if (numbers.length === 0) {
    const owner = repository.split('/')[0]!
    numbers.push(...readApi<PullRequest>(
      `repos/${repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${run.head_branch}`)}&per_page=100`
    ).map((pr) => pr.number))
  }
  if (numbers.length > 1) {
    throw new Error('Copilot run has multiple associated PRs; use manual finalization with a PR number')
  }
  return numbers[0]
}
