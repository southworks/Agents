import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { publishDraftPr, type GitHubCommand } from '../../src/publish-pr.js'

const branch = 'automation/teams-sample-sync/bot-cards'
const head = 'a'.repeat(40)
const openPr = { number: 42, headRefName: branch, headRefOid: head }

function fakeGitHub (responses: unknown[]): { run: GitHubCommand; commands: string[][] } {
  const commands: string[][] = []
  const run: GitHubCommand = (arguments_) => {
    commands.push(arguments_)
    if (arguments_[1] === 'list') {
      return JSON.stringify(responses.shift() ?? [])
    }
    return 'https://github.com/example/Agents/pull/42'
  }
  return { run, commands }
}

describe('draft PR publishing', () => {
  it('creates a PR when no open PR exists, even if a closed PR used the branch', () => {
    const gh = fakeGitHub([[], [openPr]])
    assert.equal(publishDraftPr(branch, 'Sync sample', 'pr-body.md', head, gh.run), 42)
    assert.deepEqual(gh.commands.map((command) => command.slice(0, 2)), [
      ['pr', 'list'],
      ['pr', 'create'],
      ['pr', 'list'],
    ])
    assert.ok(gh.commands[1]?.includes('--draft'))
  })

  it('edits an existing open PR by number', () => {
    const gh = fakeGitHub([[openPr], [openPr]])
    assert.equal(publishDraftPr(branch, 'Sync sample', 'pr-body.md', head, gh.run), 42)
    assert.deepEqual(gh.commands[1]?.slice(0, 3), ['pr', 'edit', '42'])
  })

  it('fails if creation returns a closed PR URL without opening a PR', () => {
    const gh = fakeGitHub([[], []])
    assert.throws(
      () => publishDraftPr(branch, 'Sync sample', 'pr-body.md', head, gh.run),
      /No open pull request points to the pushed commit/
    )
  })

  it('fails if the open PR points to a different commit', () => {
    const gh = fakeGitHub([[openPr], [{ ...openPr, headRefOid: 'b'.repeat(40) }]])
    assert.throws(
      () => publishDraftPr(branch, 'Sync sample', 'pr-body.md', head, gh.run),
      /No open pull request points to the pushed commit/
    )
  })
})
