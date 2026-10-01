import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { git, hash } from '../../src/git.js'
import { verifyPublication, type Publication } from '../../src/publication.js'
import { finalizePublication, type CurrentPublication } from '../../src/finalize-publication.js'

function fixture () {
  const root = mkdtempSync(path.join(tmpdir(), 'teams-sync-publication-test-'))
  const repo = path.join(root, 'repo')
  const directory = path.join(root, 'artifact')
  mkdirSync(repo)
  mkdirSync(directory)
  git(repo, ['init'])
  git(repo, ['config', 'user.name', 'Publication test'])
  git(repo, ['config', 'user.email', 'publication@example.com'])
  git(repo, ['config', 'core.autocrlf', 'false'])
  const names = ['bot-cards', 'bot-meetings']
  for (const name of names) {
    writeFileSync(path.join(repo, `${name}.txt`), 'original\n')
  }
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'Base'])
  const baseSha = git(repo, ['rev-parse', 'HEAD']) as string
  const samples = names.map((sample) => {
    writeFileSync(path.join(repo, `${sample}.txt`), `${sample} updated\n`)
    const patch = git(repo, ['diff', '--binary', '--', `${sample}.txt`], true) as Buffer
    const sampleDirectory = path.join(directory, 'samples', sample)
    mkdirSync(sampleDirectory, { recursive: true })
    writeFileSync(path.join(sampleDirectory, 'change.patch'), patch)
    return { sample, patchDigest: hash(patch) }
  })
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'Apply prepared changes'])
  const headSha = git(repo, ['rev-parse', 'HEAD']) as string
  const body = 'Fixes #42\n\nPrepared sample changes.\n'
  const handoffId = hash('handoff')
  writeFileSync(path.join(directory, 'handoff.json'), JSON.stringify({ version: 1, baseSha, handoffId, samples }))
  writeFileSync(path.join(directory, 'pr-body.md'), body)
  const publication: Publication & { baseRef: string } = {
    baseSha,
    baseRef: 'main',
    headSha,
    issueNumber: 42,
    title: 'Sync Teams samples',
    expectedTitle: 'Sync Teams samples',
    body,
    handoffId,
  }
  return { root, repo, directory, publication }
}

describe('publication verification', () => {
  it('accepts the exact coordinated output and leaves the inspected repository unchanged', () => {
    const f = fixture()
    try {
      verifyPublication(f.repo, f.directory, f.publication)
      assert.equal(git(f.repo, ['rev-parse', 'HEAD']), f.publication.headSha)
      assert.equal(git(f.repo, ['status', '--porcelain']), '')
      assert.equal((git(f.repo, ['worktree', 'list', '--porcelain']) as string).match(/^worktree /gm)?.length, 1)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('rejects extra corrections, unrelated files, and omitted patches', () => {
    const f = fixture()
    try {
      assert.throws(
        () => verifyPublication(f.repo, f.directory, { ...f.publication, headSha: f.publication.baseSha }),
        /PR differs.*\n/s
      )
      writeFileSync(path.join(f.repo, 'bot-cards.txt'), 'Unplanned correction\n')
      writeFileSync(path.join(f.repo, 'unrelated.txt'), 'Unrelated file\n')
      git(f.repo, ['add', '.'])
      git(f.repo, ['commit', '-m', 'Extra changes'])
      assert.throws(
        () => verifyPublication(f.repo, f.directory, {
          ...f.publication, headSha: git(f.repo, ['rev-parse', 'HEAD']) as string,
        }),
        /bot-cards\.txt\nunrelated\.txt/
      )
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('rejects rewritten descriptions, wrong issue references, titles, and moved bases', () => {
    const f = fixture()
    try {
      for (const override of [
        { body: 'Fixes #42\n\nAn agent-generated summary.' },
        { issueNumber: 43 },
        { title: 'Different title' },
        { baseSha: f.publication.headSha },
        { handoffId: hash('another handoff') },
      ]) {
        assert.throws(() => verifyPublication(f.repo, f.directory, { ...f.publication, ...override }), /differs|closing issue reference/)
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('rejects modified artifact patches before applying them', () => {
    const f = fixture()
    try {
      const patch = path.join(f.directory, 'samples', 'bot-cards', 'change.patch')
      writeFileSync(patch, `${readFileSync(patch, 'utf8')}tampered\n`)
      assert.throws(() => verifyPublication(f.repo, f.directory, f.publication), /Patch digest differs for bot-cards/)
      assert.equal(git(f.repo, ['status', '--porcelain']), '')
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })
})

function current (publication: Publication & { baseRef: string }): CurrentPublication {
  return {
    baseSha: publication.baseSha,
    baseRef: publication.baseRef,
    headSha: publication.headSha,
    title: '[WIP] Publish sync',
    body: 'Copilot progress checklist',
    state: 'open',
    draft: true,
  }
}

describe('publication finalization', () => {
  it('restores metadata before marking ready and is safe to repeat', () => {
    const f = fixture()
    try {
      const pr = current(f.publication)
      const updates: Array<{ title: string; body: string }> = []
      let readyCalls = 0
      const editor = {
        read: () => pr,
        update: (metadata: { title: string; body: string }) => {
          updates.push(metadata)
          Object.assign(pr, metadata)
        },
        ready: () => {
          assert.equal(pr.title, f.publication.expectedTitle)
          assert.equal(pr.body, f.publication.body)
          readyCalls += 1
          pr.draft = false
        },
      }
      assert.equal(finalizePublication(f.repo, f.directory, f.publication, editor), true)
      assert.deepEqual(updates, [{ title: f.publication.expectedTitle, body: f.publication.body }])
      assert.equal(pr.draft, false)
      assert.equal(pr.headSha, f.publication.headSha)
      assert.equal(finalizePublication(f.repo, f.directory, f.publication, editor), false)
      assert.equal(updates.length, 1)
      assert.equal(readyCalls, 1)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('does not edit metadata when patches are missing or the artifact is modified', () => {
    const f = fixture()
    try {
      let edits = 0
      const editor = {
        read: () => current(f.publication),
        update: () => { edits += 1 },
        ready: () => { assert.fail('Invalid files must remain draft') },
      }
      assert.throws(() => finalizePublication(f.repo, f.directory, {
        ...f.publication, headSha: f.publication.baseSha,
      }, editor), /PR differs/)
      writeFileSync(path.join(f.directory, 'samples', 'bot-cards', 'change.patch'), 'Invalid patch')
      assert.throws(() => finalizePublication(f.repo, f.directory, f.publication, editor), /Patch digest differs/)
      assert.equal(edits, 0)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('refuses to edit a moved or closed PR, or mismatching metadata on a ready PR', () => {
    const f = fixture()
    try {
      for (const override of [
        { headSha: 'new-head' },
        { baseSha: 'new-base' },
        { baseRef: 'another-branch-at-the-same-sha' },
        { state: 'closed' },
        { draft: false },
      ]) {
        let edits = 0
        assert.throws(() => finalizePublication(f.repo, f.directory, f.publication, {
          read: () => ({ ...current(f.publication), ...override }),
          update: () => { edits += 1 },
          ready: () => { assert.fail('Blocked PR must not be marked ready') },
        }), /changed during finalization|open PR|description differs/)
        assert.equal(edits, 0)
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('detects an update race and a server that does not preserve the requested metadata', () => {
    const f = fixture()
    try {
      let reads = 0
      assert.throws(() => finalizePublication(f.repo, f.directory, f.publication, {
        read: () => {
          reads += 1
          return reads === 1 ? current(f.publication) : {
            ...current(f.publication), headSha: 'new-head',
          }
        },
        update: () => {},
        ready: () => { assert.fail('A moved PR must remain draft') },
      }), /head changed during finalization/)
      assert.throws(() => finalizePublication(f.repo, f.directory, f.publication, {
        read: () => current(f.publication),
        update: () => {},
        ready: () => { assert.fail('Unverified metadata must remain draft') },
      }), /description differs/)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('marks an already matching draft ready without rewriting metadata', () => {
    const f = fixture()
    try {
      const pr = { ...current(f.publication), title: f.publication.title, body: f.publication.body }
      assert.equal(finalizePublication(f.repo, f.directory, f.publication, {
        read: () => ({ ...pr }),
        update: () => { assert.fail('Matching metadata must not be rewritten') },
        ready: () => { pr.draft = false },
      }), true)
      assert.equal(pr.draft, false)
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })

  it('reports a readiness failure and detects changes during the ready transition', () => {
    const f = fixture()
    try {
      for (const outcome of ['still-draft', 'moved-head', 'changed-metadata', 'api-error']) {
        const pr = current(f.publication)
        assert.throws(() => finalizePublication(f.repo, f.directory, f.publication, {
          read: () => ({ ...pr }),
          update: (metadata) => { Object.assign(pr, metadata) },
          ready: () => {
            if (outcome === 'api-error') {
              throw new Error('Ready API failed')
            }
            if (outcome !== 'still-draft') {
              pr.draft = false
            }
            if (outcome === 'moved-head') {
              pr.headSha = 'new-head'
            }
            if (outcome === 'changed-metadata') {
              pr.body = 'Changed during readiness'
            }
          },
        }), /still a draft|changed during finalization|description differs|Ready API failed/)
      }
    } finally {
      rmSync(f.root, { recursive: true, force: true })
    }
  })
})
