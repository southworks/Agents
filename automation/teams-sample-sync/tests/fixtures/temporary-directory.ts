import {
  chmodSync, existsSync, lstatSync, readdirSync, rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** Unlock only a dedicated test fixture before removing its read-only snapshots. */
export function removeFixtureDirectory (directory: string): void {
  const root = path.resolve(directory)
  if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('teams-sync-')) {
    throw new Error('Cleanup requires a dedicated fixture directory')
  }
  if (!existsSync(root)) {
    return
  }
  function unlock (entry: string): void {
    const info = lstatSync(entry)
    if (info.isSymbolicLink()) {
      return
    }
    chmodSync(entry, info.isDirectory() ? 0o700 : 0o600)
    if (info.isDirectory()) {
      for (const name of readdirSync(entry)) {
        unlock(path.join(entry, name))
      }
    }
  }
  unlock(root)
  rmSync(root, {
    recursive: true,
    force: true
  })
}
