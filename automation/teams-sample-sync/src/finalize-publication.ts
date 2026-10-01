/** Restores prepared metadata only after exact file verification. */
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
    if (current.state !== 'open' || !current.draft) {
      throw new SyncError('Only an open draft PR can be finalized')
    }
  }
  const current = editor.read()
  assertCurrent(current)
  const changed = current.title !== expected.title || current.body !== expected.body
  if (changed) {
    editor.update(expected)
  }
  const final = editor.read()
  assertCurrent(final)
  verifyPublicationMetadata(directory, { ...publication, title: final.title, body: final.body })
  return changed
}
