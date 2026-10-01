/** Resolves the current PR from a completion event or manual recovery input. */

export interface PullRequest {
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  draft: boolean
  created_at?: string
  base: { sha: string; ref: string }
  head: { sha: string; ref: string; repo: { full_name: string } | null }
}

export interface PublicationEvent {
  repository: { default_branch: string }
  inputs?: { finalize_pr_number?: string }
  pull_request?: { number: number }
}

export function publicationNumber (
  event: PublicationEvent,
): number {
  if (event.pull_request) {
    return event.pull_request.number
  }
  if (event.inputs?.finalize_pr_number) {
    const number = Number(event.inputs.finalize_pr_number)
    if (!/^\d+$/.test(event.inputs.finalize_pr_number) || !Number.isSafeInteger(number) || number < 1) {
      throw new Error('Manual finalization requires a positive PR number')
    }
    return number
  }
  throw new Error('Publication requires a pull request event or a recovery PR number')
}
