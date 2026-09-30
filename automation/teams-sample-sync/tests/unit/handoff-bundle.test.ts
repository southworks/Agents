import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { hash } from '../../src/git.js'
import { prepareHandoffBundle } from '../../src/handoff-bundle.js'
import type { SyncResult } from '../../src/types.js'

describe('Copilot handoff bundle', () => {
  it('includes ordered verified patches, evidence, and the prepared PR description', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'teams-sync-handoff-'))
    const resultsDirectory = path.join(root, 'results')
    const output = path.join(root, 'handoff')
    const promptDirectory = path.join(root, 'automation/teams-sample-sync/prompts')
    const samples = ['bot-cards', 'bot-meetings']
    const baseSha = 'a'.repeat(40)
    const runUrl = 'https://github.com/example/Agents/actions/runs/123'
    const artifactUrls: Record<string, string> = {}
    const results: SyncResult[] = []

    try {
      mkdirSync(promptDirectory, { recursive: true })
      writeFileSync(path.join(promptDirectory, 'handoff-agent.md'), 'Review the final diff.\n')
      const planFile = path.join(root, 'plan.json')
      writeFileSync(planFile, '{"version":3}\n')

      for (const sample of samples) {
        const directory = path.join(resultsDirectory, `teams-sample-sync-${sample}`)
        mkdirSync(directory, { recursive: true })
        for (const name of [
          'change.patch',
          'sync-result.json',
          'migration-plan.md',
          'self-audit.md',
          'source-context.json',
        ]) {
          writeFileSync(path.join(directory, name), `${sample}: ${name}\n`)
        }
        artifactUrls[`teams-sample-sync-${sample}`] = `${runUrl}/artifacts/${sample}`
        results.push({
          sample,
          summary: `Updated ${sample}.`,
          upstreamCommit: 'b'.repeat(40),
          outputDigest: `digest-${sample}`,
        } as SyncResult)
      }

      prepareHandoffBundle({
        repo: root,
        planFile,
        resultsDirectory,
        results,
        baseSha,
        runUrl,
        artifactUrls,
        output,
      })

      const handoff = JSON.parse(readFileSync(path.join(output, 'handoff.json'), 'utf8')) as {
        baseSha: string
        handoffId: string
        samples: Array<{ sample: string; patchDigest: string }>
      }
      assert.equal(handoff.baseSha, baseSha)
      assert.match(handoff.handoffId, /^sha256:[0-9a-f]{64}$/)
      assert.deepEqual(handoff.samples.map((item) => item.sample), samples)
      assert.equal(
        handoff.samples[0]?.patchDigest,
        hash(readFileSync(path.join(output, 'samples', samples[0]!, 'change.patch')))
      )
      assert.equal(readFileSync(path.join(output, 'plan.json'), 'utf8'), '{"version":3}\n')
      assert.match(readFileSync(path.join(output, 'pr-body.md'), 'utf8'), /Updated bot-cards/)
      assert.match(readFileSync(path.join(output, 'agent-instructions.md'), 'utf8'), /Review the final diff/)
      assert.equal(
        readFileSync(path.join(output, 'samples', samples[1]!, 'self-audit.md'), 'utf8'),
        'bot-meetings: self-audit.md\n'
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
