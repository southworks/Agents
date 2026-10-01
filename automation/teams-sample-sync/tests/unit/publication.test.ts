import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { git, hash } from '../../src/git.js'
import { verifyPublication, type Publication } from '../../src/publication.js'

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
  const publication: Publication = {
    baseSha,
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
        assert.throws(() => verifyPublication(f.repo, f.directory, { ...f.publication, ...override }), /differs/)
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
