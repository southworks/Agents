/** GitHub adapter for verification and post-agent metadata finalization. */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from './git.js'
import { finalizePublication } from './finalize-publication.js'
import { copilotRuns, waitForCopilot } from './copilot-completion.js'
import { verifyPublication } from './publication.js'
import { findPublicationIssue, type ReadApi } from './publication-issue.js'
import { publicationNumber, type PublicationEvent, type PullRequest } from './publication-event.js'

const CHECK_NAME = 'Teams sync publication'

function gh (args: string[], input?: unknown): string {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    input: input === undefined ? undefined : JSON.stringify(input),
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || 'GitHub CLI failed')
  }
  return result.stdout
}

const readApi: ReadApi = <T>(endpoint: string): T[] =>
  (JSON.parse(gh(['api', '--paginate', '--slurp', endpoint])) as unknown[]).flat() as T[]

function writeApi<T> (method: 'POST' | 'PATCH', endpoint: string, body: unknown): T {
  return JSON.parse(gh(['api', '--method', method, endpoint, '--input', '-'], body)) as T
}

function publicationCheck (repository: string, sha: string): number {
  const pages = readApi<{ check_runs: Array<{ id: number; status: string; app: { slug: string } }> }>(
    `repos/${repository}/commits/${sha}/check-runs?check_name=${encodeURIComponent(CHECK_NAME)}&per_page=100`
  )
  const existing = pages.flatMap((page) => page.check_runs)
    .filter((check) => check.app.slug === 'github-actions' && check.status !== 'completed')
    .sort((left, right) => right.id - left.id)[0]
  const pending = {
    name: CHECK_NAME,
    status: 'in_progress',
    output: { title: 'Checking prepared publication', summary: 'Waiting for final file and metadata verification.' },
  }
  if (existing) {
    writeApi('PATCH', `repos/${repository}/check-runs/${existing.id}`, pending)
    return existing.id
  }
  return writeApi<{ id: number }>('POST', `repos/${repository}/check-runs`, {
    ...pending, head_sha: sha,
  }).id
}

function agentRunning (repository: string, pr: PullRequest): boolean {
  return copilotRuns(repository, pr, readApi).some((run) => run.status !== 'completed')
}

async function inspectPublication (event: PublicationEvent, mode: 'verify' | 'finalize'): Promise<void> {
  const repo = process.cwd()
  const repository = process.env.GITHUB_REPOSITORY!
  const number = publicationNumber(event)
  const readPr = (): PullRequest => readApi<PullRequest>(`repos/${repository}/pulls/${number}`)[0]!
  let pr = readPr()
  if (pr.state !== 'open') {
    process.stdout.write('PR is closed; no publication to process.\n')
    return
  }
  if (pr.head.repo?.full_name !== repository) {
    process.stdout.write('PR is outside the repository; no Teams sync publication to process.\n')
    return
  }
  let issue = findPublicationIssue(repository, pr.number, pr.body ?? '', pr.html_url, readApi)
  const isSync = issue !== undefined || /\bSync (?:Teams|\d+ Teams)/.test(pr.title) ||
    readApi<{ filename: string }>(`repos/${repository}/pulls/${pr.number}/files?per_page=100`).some(
      (file) => /^automation\/teams-sample-sync\/state\/[^/]+\.lock\.json$/.test(file.filename)
    )
  if (!isSync) {
    process.stdout.write('No Teams sync publication to process.\n')
    return
  }
  let checkId = publicationCheck(repository, pr.head.sha)
  const complete = (conclusion: 'success' | 'failure' | 'neutral', summary: string): void => {
    writeApi('PATCH', `repos/${repository}/check-runs/${checkId}`, {
      status: 'completed',
      conclusion,
      output: { title: conclusion === 'success' ? 'Prepared publication verified' : 'Publication blocked', summary },
    })
  }
  try {
    if (mode === 'finalize') {
      const waitingHead = pr.head.sha
      pr = await waitForCopilot(repository, readPr, readApi)
      if (pr.state !== 'open' || pr.head.repo?.full_name !== repository) {
        complete('neutral', 'PR was closed or moved outside the repository while waiting; no update made.')
        return
      }
      if (pr.head.sha !== waitingHead) {
        complete('neutral', 'Copilot updated the PR head; verification continues on the final commit.')
        checkId = publicationCheck(repository, pr.head.sha)
      }
      issue = findPublicationIssue(repository, pr.number, pr.body ?? '', pr.html_url, readApi)
    }
    git(repo, ['fetch', 'origin', `refs/pull/${pr.number}/head`])
    if (git(repo, ['rev-parse', 'FETCH_HEAD']) !== pr.head.sha) {
      throw new Error('PR head changed during fetch; rerun against the current PR')
    }
    if (agentRunning(repository, pr)) {
      if (mode === 'finalize') {
        throw new Error('Copilot is still running; finalize only after its session completes')
      }
      process.stdout.write('Copilot is still running; publication check remains pending.\n')
      return
    }
    if (!issue) {
      throw new Error('Sync PR must reference its prepared handoff issue')
    }
    const handoffId = /<!-- teams-sample-sync-handoff:(sha256:[0-9a-f]{64}) -->/.exec(issue.body)?.[1]
    const artifactId = /\/actions\/runs\/\d+\/artifacts\/(\d+)/.exec(issue.body)?.[1]
    const expectedTitle = /^- \*\*PR title:\*\* `([^`]+)`$/m.exec(issue.body)?.[1]
    const targetBranch = /^- \*\*Target branch:\*\* `([^`]+)`/m.exec(issue.body)?.[1]
    if (!handoffId || !artifactId || !expectedTitle || targetBranch !== pr.base.ref) {
      throw new Error('Sync issue is missing its completed handoff or targets another branch')
    }
    const artifact = readApi<{
      name: string
      expired: boolean
      workflow_run: { id: number }
    }>(`repos/${repository}/actions/artifacts/${artifactId}`)[0]!
    const artifactName = new RegExp(`^teams-sample-sync-handoff-${artifact.workflow_run.id}-([1-9][0-9]*)$`).exec(artifact.name)
    if (artifact.expired || !artifactName) {
      throw new Error('Prepared handoff artifact is expired or has an invalid name')
    }
    const run = readApi<{
      path: string
      event: string
      head_branch: string
    }>(`repos/${repository}/actions/runs/${artifact.workflow_run.id}/attempts/${artifactName[1]}`)[0]!
    if (
      run.path !== '.github/workflows/sync-teams-dotnet-samples.yml' ||
      !['schedule', 'workflow_dispatch'].includes(run.event) ||
      run.head_branch !== event.repository.default_branch
    ) {
      throw new Error('Handoff must come from the sync workflow on the default branch')
    }
    const directory = mkdtempSync(path.join(tmpdir(), 'teams-sync-artifact-'))
    try {
      gh(['run', 'download', String(artifact.workflow_run.id), '--repo', repository, '--name', artifact.name, '--dir', directory])
      const publication = {
        baseSha: pr.base.sha,
        baseRef: pr.base.ref,
        headSha: pr.head.sha,
        issueNumber: issue.number,
        title: pr.title,
        body: pr.body ?? '',
        expectedTitle,
        handoffId,
      }
      if (mode === 'finalize') {
        const changed = finalizePublication(repo, directory, publication, {
          read: () => {
            const current = readPr()
            if (agentRunning(repository, current)) {
              throw new Error('A new Copilot session started during finalization; retry after completion')
            }
            return {
              baseSha: current.base.sha,
              baseRef: current.base.ref,
              headSha: current.head.sha,
              title: current.title,
              body: current.body ?? '',
              draft: current.draft,
              state: current.state,
            }
          },
          update: (metadata) => {
            writeApi('PATCH', `repos/${repository}/pulls/${pr.number}`, metadata)
          },
          ready: () => {
            gh(['pr', 'ready', String(pr.number), '--repo', repository])
          },
        })
        process.stdout.write(changed ? 'Prepared publication verified; PR is ready for review.\n' : 'Prepared publication already matches and is ready for review; no update needed.\n')
      } else {
        verifyPublication(repo, directory, publication)
        const current = readPr()
        if (current.base.sha !== pr.base.sha || current.base.ref !== pr.base.ref || current.head.sha !== pr.head.sha ||
          current.title !== pr.title || current.body !== pr.body) {
          throw new Error('PR changed during verification; rerun against the current PR')
        }
      }
      complete('success', mode === 'finalize'
        ? 'PR files, title, and description match the prepared handoff; PR is ready for review.'
        : 'PR files, title, and description match the prepared handoff.')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  } catch (error) {
    complete('failure', error instanceof Error ? error.message : String(error))
    throw error
  }
}

try {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8')) as PublicationEvent
  const mode = process.env.PUBLICATION_MODE === 'finalize' ? 'finalize' : 'verify'
  await inspectPublication(event, mode)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
