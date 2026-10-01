/** Checks publication against prepared patches without executing PR code. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SyncError } from './config.js'
import { git, hash } from './git.js'

export interface Publication {
  baseSha: string
  headSha: string
  issueNumber: number
  title: string
  body: string
  expectedTitle: string
  handoffId: string
}

export function verifyPublication (repo: string, directory: string, publication: Publication): void {
  const handoff = JSON.parse(readFileSync(path.join(directory, 'handoff.json'), 'utf8')) as {
    version: number
    baseSha: string
    handoffId: string
    samples: Array<{ sample: string; patchDigest: string }>
  }
  if (
    handoff.version !== 1 ||
    handoff.baseSha !== publication.baseSha ||
    handoff.handoffId !== publication.handoffId ||
    !Array.isArray(handoff.samples) ||
    handoff.samples.length === 0
  ) {
    throw new SyncError('PR base or handoff identity differs from the prepared publication')
  }
  const expectedBody = readFileSync(path.join(directory, 'pr-body.md'), 'utf8').trim()
  if (
    !expectedBody.startsWith(`Fixes #${publication.issueNumber}\n\n`) ||
    publication.body.trim() !== expectedBody ||
    publication.title !== publication.expectedTitle
  ) {
    throw new SyncError('PR title or description differs from the prepared publication')
  }

  const worktree = mkdtempSync(path.join(tmpdir(), 'teams-sync-publication-'))
  let added = false
  try {
    git(repo, ['worktree', 'add', '--detach', worktree, publication.baseSha])
    added = true
    const seen = new Set<string>()
    for (const entry of handoff.samples) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.sample) || seen.has(entry.sample)) {
        throw new SyncError('Invalid or duplicate sample in publication handoff')
      }
      seen.add(entry.sample)
      const patch = path.join(directory, 'samples', entry.sample, 'change.patch')
      if (hash(readFileSync(patch)) !== entry.patchDigest) {
        throw new SyncError(`Patch digest differs for ${entry.sample}`)
      }
      git(worktree, ['apply', '--index', '--binary', patch])
    }
    const expectedTree = git(worktree, ['write-tree']) as string
    const actualTree = git(repo, ['rev-parse', `${publication.headSha}^{tree}`]) as string
    if (expectedTree !== actualTree) {
      const paths = git(repo, ['diff', '--name-only', expectedTree, actualTree]) as string
      throw new SyncError(`PR differs from the prepared patches:\n${paths}`)
    }
  } finally {
    if (added) {
      git(repo, ['worktree', 'remove', '--force', worktree])
    }
    rmSync(worktree, { recursive: true, force: true })
  }
}
