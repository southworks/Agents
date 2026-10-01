/** Waits for the PR's Copilot session and its final metadata to settle. */
import { setTimeout } from 'node:timers/promises'
import type { ReadApi } from './publication-issue.js'
import type { PullRequest } from './publication-event.js'

export interface CopilotRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
  head_branch: string
  pull_requests: Array<{ number: number }>
}

export function copilotRuns (repository: string, pr: PullRequest, readApi: ReadApi): CopilotRun[] {
  const pages = readApi<{ workflow_runs: CopilotRun[] }>(
    `repos/${repository}/actions/runs?event=dynamic&branch=${encodeURIComponent(pr.head.ref)}&per_page=100`
  )
  return pages.flatMap((page) => page.workflow_runs).filter((run) =>
    run.name === 'Running Copilot cloud agent' && run.head_branch === pr.head.ref &&
    (run.pull_requests.some((candidate) => candidate.number === pr.number) ||
      (run.pull_requests.length === 0 && pr.created_at !== undefined && run.created_at >= pr.created_at))
  ).sort((left, right) => right.id - left.id)
}

interface WaitOptions {
  timeoutMs: number
  pollMs: number
  now: () => number
  sleep: (milliseconds: number) => Promise<unknown>
  log: (message: string) => void
}

export async function waitForCopilot (
  repository: string,
  readPr: () => PullRequest,
  readApi: ReadApi,
  options: Partial<WaitOptions> = {}
): Promise<PullRequest> {
  const settings: WaitOptions = {
    timeoutMs: 20 * 60 * 1000,
    pollMs: 15 * 1000,
    now: Date.now,
    sleep: setTimeout,
    log: (message) => process.stdout.write(`${message}\n`),
    ...options,
  }
  const deadline = settings.now() + settings.timeoutMs
  let settled: string | undefined
  while (true) {
    const pr = readPr()
    if (pr.state !== 'open' || pr.head.repo?.full_name !== repository) {
      return pr
    }
    const runs = copilotRuns(repository, pr, readApi)
    const latest = runs[0]
    if (latest && runs.every((run) => run.status === 'completed')) {
      if (latest.conclusion !== 'success') {
        throw new Error(`Copilot run ${latest.id} did not succeed (${latest.conclusion}); publication blocked`)
      }
      const snapshot = JSON.stringify([latest.id, pr.base, pr.head.sha, pr.head.ref, pr.title, pr.body, pr.draft])
      if (snapshot === settled) {
        return pr
      }
      settled = snapshot
      settings.log(`Copilot run ${latest.id} completed; waiting for PR metadata to settle.`)
    } else {
      settled = undefined
      settings.log(latest ? `Waiting for Copilot run ${latest.id} (${latest.status}).` : 'Waiting for the PR Copilot run to appear.')
    }
    if (settings.now() >= deadline) {
      throw new Error('Timed out waiting for Copilot completion; PR was not finalized. Rerun this job after Copilot finishes.')
    }
    await settings.sleep(Math.min(settings.pollMs, deadline - settings.now()))
  }
}
