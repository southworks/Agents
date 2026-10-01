import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { publicationNumber } from '../../src/publication-event.js'

describe('publication events', () => {
  const repository = { default_branch: 'main' }

  it('finalizes directly from a PR event without a workflow completion event', () => {
    assert.equal(publicationNumber({ repository, pull_request: { number: 58 } }), 58)
  })

  it('supports manual recovery and rejects malformed or missing PR numbers', () => {
    assert.equal(publicationNumber({ repository, inputs: { finalize_pr_number: '58' } }), 58)
    for (const number of ['0', '-1', '1.5', 'NaN', '9007199254740992']) {
      assert.throws(() => publicationNumber({ repository, inputs: { finalize_pr_number: number } }), /positive PR/)
    }
    assert.throws(() => publicationNumber({ repository }), /pull request event or a recovery PR number/)
  })
})
