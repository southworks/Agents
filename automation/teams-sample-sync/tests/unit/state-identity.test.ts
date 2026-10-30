import assert from 'node:assert/strict'
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { readPriorState, readState, statePath } from '../../src/state.js'
import type { State } from '../../src/types.js'

const dotnet = {
  language: 'dotnet',
  sample: 'bot-cards'
} as const

function state (): State {
  return {
    version: 3,
    ...dotnet,
    upstreamCommit: 'new-commit',
    sourceTree: 'new-tree',
    inputDigest: 'input',
    outputDigest: 'output',
    componentDigests: Object.fromEntries([
      'sourceTree', 'target', 'protection', 'migrationSkill', 'manifestSkill',
      'canonicalSample', 'manifestAssets', 'copilot', 'packagePolicy', 'validator', 'syncSkill',
    ].map((key) => [key, key])),
    status: 'verified',
  }
}

describe('language-qualified verified state', () => {
  it('uses legacy .NET state for history only and prefers verified namespaced state', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'teams-sync-legacy-'))
    try {
      const directory = path.dirname(path.dirname(statePath(root, dotnet)))
      mkdirSync(directory, { recursive: true })
      writeFileSync(path.join(directory, 'bot-cards.lock.json'), JSON.stringify({
        version: 2,
        sample: dotnet.sample,
        upstreamCommit: 'legacy-commit',
        sourceTree: 'legacy-tree',
      }))
      assert.equal(readState(root, dotnet), undefined)
      assert.deepEqual(readPriorState(root, dotnet), {
        upstreamCommit: 'legacy-commit',
        sourceTree: 'legacy-tree'
      })

      const current = state()
      const file = statePath(root, dotnet)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(current))
      assert.deepEqual(readState(root, dotnet), current)
      assert.deepEqual(readPriorState(root, dotnet), {
        upstreamCommit: 'new-commit',
        sourceTree: 'new-tree'
      })
    } finally {
      rmSync(root, {
        recursive: true,
        force: true
      })
    }
  })

  it('rejects cross-language, incomplete and malformed namespaced state', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'teams-sync-invalid-state-'))
    try {
      const file = statePath(root, dotnet)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify({
        ...state(),
        language: 'js'
      }))
      assert.throws(() => readState(root, dotnet), /Unsupported language: js/)
      writeFileSync(file, JSON.stringify({
        ...state(),
        componentDigests: {}
      }))
      assert.throws(() => readState(root, dotnet), /incomplete component digests/)
      writeFileSync(file, '{')
      assert.throws(() => readState(root, dotnet), /Invalid state JSON/)
    } finally {
      rmSync(root, {
        recursive: true,
        force: true
      })
    }
  })
})
