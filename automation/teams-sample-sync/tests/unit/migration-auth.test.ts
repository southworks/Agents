import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withMigrationCredentialFallback, type MigrationAttempt } from '../../src/migration-auth.js'

const rejected: MigrationAttempt = {
  code: 1,
  planningCompleted: false,
  error: 'get_model_list: {"status":403,"body":"Organization does not have the Allow use of Copilot CLI billed to the organization policy enabled"}',
}

test('organization billing rejection retries once with the PAT', async () => {
  const tokens: Array<string | undefined> = []
  const code = await withMigrationCredentialFallback('automatic', 'pat', async (token) => {
    tokens.push(token)

    return token === 'automatic'
      ? rejected
      : {
          code: 0,
          planningCompleted: true
        }
  }, () => {})
  assert.equal(code, 0)
  assert.deepEqual(tokens, ['automatic', 'pat'])
})

test('success, unrelated failures, and failures after planning never switch credentials', async () => {
  for (const result of [
    {
      code: 0,
      planningCompleted: true
    },
    {
      ...rejected,
      planningCompleted: true
    },
    {
      ...rejected,
      error: 'get_model_list: {"status":401}'
    },
    {
      ...rejected,
      error: 'get_model_list: {"status":403,"body":"Access denied"}'
    },
    {
      ...rejected,
      error: 'Validation failed'
    },
  ]) {
    const tokens: Array<string | undefined> = []
    assert.equal(await withMigrationCredentialFallback('automatic', 'pat', async (token) => {
      tokens.push(token)

      return result
    }), result.code)
    assert.deepEqual(tokens, ['automatic'])
  }
})

test('missing PAT and rejected PAT preserve failure without further retries', async () => {
  for (const fallback of [undefined, 'pat']) {
    const tokens: Array<string | undefined> = []
    assert.equal(await withMigrationCredentialFallback('automatic', fallback, async (token) => {
      tokens.push(token)

      return rejected
    }, () => {}), 1)
    assert.deepEqual(tokens, fallback ? ['automatic', 'pat'] : ['automatic'])
  }
})
