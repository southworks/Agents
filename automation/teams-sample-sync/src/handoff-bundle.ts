/** Packages verified sample patches and evidence for a Copilot issue assignment. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SyncError } from './config.js'
import { hash } from './git.js'
import { combinedPrBody, handoffId } from './report.js'
import type { SyncResult } from './types.js'

export interface HandoffBundleOptions {
  planFile: string
  resultsDirectory: string
  results: SyncResult[]
  baseSha: string
  runUrl: string
  artifactUrls: Record<string, string>
  issueNumber: number
  output: string
}

const sampleFiles = [
  'change.patch',
  'sync-result.json',
  'migration-plan.md',
  'self-audit.md',
  'source-context.json',
]

export function prepareHandoffBundle (options: HandoffBundleOptions): void {
  const body = combinedPrBody(options.results, options.runUrl, options.artifactUrls, options.issueNumber)
  for (const result of options.results) {
    if (!options.artifactUrls[`teams-sample-sync-${result.sample}`]) {
      throw new SyncError(`Missing evidence artifact URL for ${result.sample}`)
    }
  }

  mkdirSync(options.output, { recursive: true })
  copyFileSync(options.planFile, path.join(options.output, 'plan.json'))

  const samples = options.results.map((result) => {
    const source = path.join(options.resultsDirectory, `teams-sample-sync-${result.sample}`)
    const destination = path.join(options.output, 'samples', result.sample)
    mkdirSync(destination, { recursive: true })
    for (const name of sampleFiles) {
      const file = path.join(source, name)
      if (!existsSync(file)) {
        throw new SyncError(`Missing handoff file for ${result.sample}: ${name}`)
      }
      copyFileSync(file, path.join(destination, name))
    }
    return {
      sample: result.sample,
      patchDigest: hash(readFileSync(path.join(destination, 'change.patch'))),
      outputDigest: result.outputDigest,
    }
  })

  const handoff = {
    version: 1,
    handoffId: handoffId(options.baseSha, options.results),
    baseSha: options.baseSha,
    runUrl: options.runUrl,
    samples,
  }
  writeFileSync(
    path.join(options.output, 'handoff.json'),
    `${JSON.stringify(handoff, null, 2)}\n`,
    'utf8'
  )
  writeFileSync(
    path.join(options.output, 'pr-body.md'),
    body,
    'utf8'
  )
}
