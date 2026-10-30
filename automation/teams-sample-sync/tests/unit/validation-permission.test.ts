import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateTool, type ToolHost } from '../../src/agent-tools.js'

test('code validation cannot prepare dependencies during read-only session phases', async () => {
  const host = { canValidateCode: () => false, } as ToolHost
  // Permission is checked before guards, filesystem inspection or any command.
  await assert.rejects(validateTool(host, 'code'), /only after the migration plan grants write access/)
  await assert.rejects(validateTool(host, 'all'), /only after the migration plan grants write access/)
})
