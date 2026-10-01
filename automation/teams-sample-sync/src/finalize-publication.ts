/** Restores prepared metadata and marks the PR ready only after verification. */
import { SyncError } from './config.js'
import { preparedMetadata, verifyPublicationFiles, verifyPublicationMetadata, type Publication } from './publication.js'

export interface CurrentPublication {
  baseSha: string
  baseRef: string
  headSha: string
  title: string
  body: string
  state: string
  draft: boolean
}

export interface PublicationEditor {
  read: () => CurrentPublication
  update: (metadata: { title: string; body: string }) => void
  ready: () => void
}

export function finalizePublication (
  repo: string,
  directory: string,
  publication: Publication & { baseRef: string },
  editor: PublicationEditor
): boolean {
  verifyPublicationFiles(repo, directory, publication)
  const expected = preparedMetadata(directory, publication.issueNumber, publication.expectedTitle)
  const assertCurrent = (current: CurrentPublication): void => {
    if (current.baseSha !== publication.baseSha || current.headSha !== publication.headSha ||
      current.baseRef !== publication.baseRef) {
      throw new SyncError('PR base or head changed during finalization; rerun against the current PR')
    }
    if (current.state !== 'open') {
      throw new SyncError('Only an open PR can be finalized')
    }
  }
  const current = editor.read()
  assertCurrent(current)
  if (!current.draft) {
    verifyPublicationMetadata(directory, { ...publication, title: current.title, body: current.body })
    return false
  }
  const changed = current.title !== expected.title || current.body !== expected.body
  if (changed) {
    editor.update(expected)
  }
  const final = editor.read()
  assertCurrent(final)
  verifyPublicationMetadata(directory, { ...publication, title: final.title, body: final.body })
  const wasDraft = final.draft
  if (wasDraft) {
    editor.ready()
  }
  const ready = editor.read()
  assertCurrent(ready)
  verifyPublicationMetadata(directory, { ...publication, title: ready.title, body: ready.body })
  if (ready.draft) {
    throw new SyncError('PR is still a draft after marking it ready for review')
  }
  return changed || wasDraft
}
