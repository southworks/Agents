/** GitHub Actions adapter; only trusted base-branch tooling is executed. */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from './git.js'
import { verifyPublication } from './publication.js'
import { findPublicationIssue, type ReadApi } from './publication-issue.js'

function gh (args: string[]): string {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || 'GitHub CLI failed')
  }
  return result.stdout
}

try {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8')) as {
    repository: { default_branch: string }
    pull_request: {
      number: number
      title: string
      body: string | null
      html_url: string
      base: { sha: string; ref: string }
      head: { sha: string }
    }
  }
  const pr = event.pull_request
  const repo = process.cwd()
  const repository = process.env.GITHUB_REPOSITORY!
  const readApi: ReadApi = <T>(endpoint: string): T[] =>
    (JSON.parse(gh(['api', '--paginate', '--slurp', endpoint])) as unknown[]).flat() as T[]
  git(repo, ['fetch', 'origin', `refs/pull/${pr.number}/head`])
  const paths = git(repo, ['diff', '--name-only', `${pr.base.sha}...${pr.head.sha}`]) as string
  const body = pr.body ?? ''
  const issue = findPublicationIssue(repository, pr.number, body, pr.html_url, readApi)
  const isSync = issue !== undefined || /^Sync (?:Teams|\d+ Teams)/.test(pr.title) ||
    paths.split('\n').some((file) => /^automation\/teams-sample-sync\/state\/[^/]+\.lock\.json$/.test(file))
  if (isSync) {
    if (!issue) {
      throw new Error('Sync PR must reference its prepared handoff issue')
    }
    const handoffId = /<!-- teams-sample-sync-handoff:(sha256:[0-9a-f]{64}) -->/.exec(issue.body)?.[1]
    const artifactId = /\/actions\/runs\/\d+\/artifacts\/(\d+)/.exec(issue.body)?.[1]
    const expectedTitle = /^- \*\*PR title:\*\* `([^`]+)`$/m.exec(issue.body)?.[1]
    const targetBranch = /^- \*\*Target branch:\*\* `([^`]+)`/m.exec(issue.body)?.[1]
    if (issue.pull_request || !handoffId || !artifactId || !expectedTitle || targetBranch !== pr.base.ref) {
      throw new Error('Sync issue is missing its completed publication handoff or targets another branch')
    }
    const artifact = JSON.parse(gh(['api', `repos/${repository}/actions/artifacts/${artifactId}`])) as {
      name: string
      expired: boolean
      workflow_run: { id: number }
    }
    const artifactName = new RegExp(`^teams-sample-sync-handoff-${artifact.workflow_run.id}-([1-9][0-9]*)$`).exec(artifact.name)
    if (artifact.expired || !artifactName) {
      throw new Error('Prepared handoff artifact is expired or has an invalid name')
    }
    const run = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${artifact.workflow_run.id}/attempts/${artifactName[1]}`])) as {
      path: string
      event: string
      head_branch: string
    }
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
      verifyPublication(repo, directory, {
        baseSha: pr.base.sha,
        headSha: pr.head.sha,
        issueNumber: issue.number,
        title: pr.title,
        body,
        expectedTitle,
        handoffId,
      })
      process.stdout.write('PR matches the prepared patches, title, and description.\n')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  } else {
    process.stdout.write('No Teams sync publication to verify.\n')
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
