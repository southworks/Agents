/** Resolves a sync handoff even when an agent rewrites its PR metadata. */
export interface PublicationIssue {
  number: number
  body: string
  pull_request?: unknown
}

export type ReadApi = <T>(endpoint: string) => T[]

export function findPublicationIssue (
  repository: string,
  prNumber: number,
  body: string,
  prUrl: string,
  readApi: ReadApi
): PublicationIssue | undefined {
  const isHandoff = (issue: PublicationIssue): boolean =>
    !issue.pull_request && /<!-- teams-sample-sync-handoff:sha256:[0-9a-f]{64} -->/.test(issue.body ?? '')
  const references = [...body.matchAll(/\b(?:Fixes|Closes|Resolves)\s+#(\d+)\b/gi)]
  for (const reference of references) {
    let issue: PublicationIssue | undefined
    try {
      issue = readApi<PublicationIssue>(`repos/${repository}/issues/${reference[1]}`)[0]
    } catch (error) {
      if (error instanceof Error && /HTTP 404/.test(error.message)) {
        continue
      }
      throw error
    }
    if (issue && isHandoff(issue)) {
      return issue
    }
  }
  // The source issue's timeline retains the PR cross-reference if its title/body is later rewritten.
  const candidates = readApi<PublicationIssue>(
    `repos/${repository}/issues?state=all&per_page=100`
  ).filter(isHandoff)
  for (const issue of candidates) {
    const events = readApi<{
      event: string
      source?: { issue?: { number: number; html_url: string } }
    }>(`repos/${repository}/issues/${issue.number}/timeline?per_page=100`)
    if (events.some((event) => event.event === 'cross-referenced' &&
      event.source?.issue?.number === prNumber && event.source.issue.html_url === prUrl)) {
      return issue
    }
  }
  return undefined
}
