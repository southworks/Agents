/** For Copilot Agents only: workflow reporting infrastructure. */
/**
 * Turns structured synchronization results into CI-facing output.
 * It keeps workflow logs concise and builds short PR and issue handoffs from publishable results.
 */
import type { SyncResult } from './types.js'
import { hash, stable } from './git.js'

function safe (value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/([\\`*_[\]!|])/g, '\\$1')
    .trim()
}
function code (value: string): string {
  return `\`${safe(value).replaceAll('`', '')}\``
}
function validation (result: SyncResult): string[] {
  return Object.entries(result.validation?.checks ?? {}).map(
    ([name, check]) =>
      `- ${name}: **${check.status}**${check.errors.length ? ` — ${safe(check.errors.join('; '))}` : ''}`
  )
}

function workflowCommandData (value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

function workflowCommandProperty (value: string): string {
  return workflowCommandData(value).replaceAll(':', '%3A').replaceAll(',', '%2C')
}

export function githubErrorAnnotation (title: string, message: string): string {
  return `::error title=${workflowCommandProperty(title)}::${workflowCommandData(message)}`
}

export function failureReport (result: SyncResult): { stderr: string; annotation: string } | undefined {
  if (result.status !== 'failed') {
    return undefined
  }
  const message =
    result.error?.trim() ||
    result.diagnostics.find((item) => item.trim())?.trim() ||
    'Sample synchronization failed without a diagnostic.'
  return {
    stderr: `Sample synchronization failed (${result.sample}): ${message}`,
    annotation: githubErrorAnnotation(`${result.sample} synchronization failed`, message),
  }
}

export function prTitle (results: SyncResult[]): string {
  if (results.length === 1) {
    return `Sync Teams sample: ${results[0]!.sample.replaceAll('-', ' ')}`
  }
  if (results.length === 2) {
    return `Sync Teams samples: ${results.map((result) => result.sample.replaceAll('-', ' ')).join(' and ')}`
  }
  return `Sync ${results.length} Teams .NET samples with upstream`
}

export function issueTitle (results: SyncResult[]): string {
  if (results.length === 1) {
    return `Publish Teams sample: ${results[0]!.sample.replaceAll('-', ' ')}`
  }
  if (results.length === 2) {
    return `Publish Teams samples: ${results.map((result) => result.sample.replaceAll('-', ' ')).join(' and ')}`
  }
  return `Publish ${results.length} synced Teams .NET samples`
}

export function handoffId (baseSha: string, results: SyncResult[]): string {
  return hash(stable({
    baseSha,
    samples: results.map((result) => ({
      sample: result.sample,
      upstreamCommit: result.upstreamCommit,
      inputDigest: result.inputDigest,
      outputDigest: result.outputDigest,
    })),
  }))
}

export function combinedPrBody (
  results: SyncResult[],
  runUrl: string,
  artifactUrls: Record<string, string>,
  issueNumber: number
): string {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new Error('A positive issue number is required for the PR description')
  }
  return [
    `Fixes #${issueNumber}`,
    '',
    'This PR records a coordinated, validated sync of the Teams .NET samples below with the upstream Teams SDK.',
    '',
    '### Samples',
    '',
    ...results.map((result) => `- **${safe(result.sample)}:** ${safe(result.summary!)}`),
    '',
    `All samples passed automated validation. [View the workflow summary and validation results](${runUrl}).`,
    '',
    '<details>',
    '<summary>Migration evidence and review notes</summary>',
    '',
    ...results.map((result) => {
      const artifact = artifactUrls[`teams-sample-sync-${result.sample}`]!
      return `- **${safe(result.sample)}:** [Copilot log, plan, and self-audit](${artifact})`
    }),
    '',
    `Upstream Teams SDK commit: ${code(results[0]?.upstreamCommit ?? 'unknown')}`,
    '',
    'Review credentialed Teams and external service behavior before merge.',
    '',
    '</details>',
    '',
  ].join('\n')
}

export function handoffIssueBody (
  results: SyncResult[],
  baseSha: string,
  baseBranch: string,
  repository: string,
  runUrl: string,
  handoffUrl: string | undefined,
  handoffArtifact: string
): string {
  const runId = /\/actions\/runs\/(\d+)/.exec(runUrl)?.[1]
  return [
    `The Teams sample sync workflow validated ${results.length} samples and prepared their changes.`,
    'The implementation is complete. Copilot only needs to apply the prepared patches and create a draft PR.',
    '',
    '### Handoff',
    '',
    `- **Target branch:** ${code(baseBranch)} at ${code(baseSha)}`,
    `- **PR title:** ${code(prTitle(results))}`,
    `- **Workflow:** [run and validation summary](${runUrl})`,
    ...(handoffUrl
      ? [
          `- **Prepared changes and PR description:** [download the handoff artifact](${handoffUrl}) (${code(handoffArtifact)})`,
          ...(runId ? [`- **Download:** ${code(`gh run download ${runId} --repo ${repository} --name ${handoffArtifact}`)}`] : []),
        ]
      : ['- **Status:** Preparing the handoff artifact. Do not start publication until it is available.']),
    '',
    '### Copilot task',
    '',
    '1. Read `handoff.json` and `plan.json`. Confirm the target branch still matches `baseSha` before applying changes.',
    '2. In `handoff.json` order, verify each `samples/<sample>/change.patch` against its `patchDigest` and apply it exactly, including synchronization state.',
    '3. Include every supplied patch and only its changes. Do not add fixes, refactoring, formatting changes, dependency updates, or other files. Do not redo the migrations.',
    '4. Create a draft PR linked to this issue. Use the PR title above and `pr-body.md` when your tools support it. The workflow will restore the exact title and description after your session finishes.',
    '5. If the artifact cannot be downloaded, a patch fails verification or application, the base has moved, or you identify an omission, report the blocker in this issue and leave the PR as a draft. Do not independently repair it.',
    '6. After applying the patches and creating the draft PR, stop. Do not wait for publication checks, request human review, or mark the PR ready for review. Leave readiness to a human.',
    '',
    `<!-- teams-sample-sync-handoff:${handoffId(baseSha, results)} -->`,
  ].join('\n')
}

export function workflowSummary (result: SyncResult): string {
  const outcome =
    result.status === 'no-changes'
      ? ['No sample changes were required; only verified synchronization state will be recorded.', '']
      : []
  return [
    `### ${safe(result.sample)}: ${result.status}`,
    '',
    result.error ? safe(result.error) : '',
    '',
    ...outcome,
    `Diagnostic artifact: ${code(`teams-sample-sync-${result.sample}`)}`,
    '',
    ...(result.validation ? ['#### Validation', '', ...validation(result), ''] : []),
    ...(result.diagnostics.length
      ? ['#### Diagnostics', '', ...result.diagnostics.map((item) => `- ${safe(item)}`), '']
      : []),
  ].join('\n')
}
