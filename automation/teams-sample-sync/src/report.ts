/** For Copilot Agents only: workflow reporting infrastructure. */
/**
 * Turns structured synchronization results into CI-facing output.
 * It keeps workflow logs concise and builds short PR and issue handoffs from publishable results.
 */
import type { SyncResult } from './types.js'

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
    return `Open PR for Teams sample: ${results[0]!.sample.replaceAll('-', ' ')}`
  }
  if (results.length === 2) {
    return `Open PR for Teams samples: ${results.map((result) => result.sample.replaceAll('-', ' ')).join(' and ')}`
  }
  return `Open PR for ${results.length} synced Teams .NET samples`
}

export function combinedPrBody (
  results: SyncResult[],
  runUrl: string,
  artifactUrls: Record<string, string>
): string {
  return [
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
  branch: string,
  baseBranch: string,
  repository: string,
  runUrl: string,
  handoffUrl: string
): string {
  const compareUrl = `https://github.com/${repository}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(branch)}?expand=1`
  return [
    'The Teams sample sync workflow has validated the selected samples and pushed their changes.',
    'PR creation from GitHub Actions and GitHub CLI is restricted here, so this issue is the handoff.',
    '',
    '### Handoff',
    '',
    `- **Changes:** [${code(branch)} → ${code(baseBranch)}](${compareUrl})`,
    `- **Workflow:** [run and validation summary](${runUrl})`,
    `- **Prepared PR title:** ${prTitle(results)}`,
    `- **Prepared PR description:** [download the handoff artifact](${handoffUrl}) and use \`pr-body.md\``,
    '',
    '### Create the PR',
    '',
    'Open one draft PR from the branch above into the target branch using the prepared title and description.',
    `Expect one commit per sample (${results.length} total). The migrations and validation are complete; do not redo them.`,
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
