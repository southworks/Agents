import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parse } from 'yaml'
import { configuration } from '../../src/config.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

test('Python sample CI preserves top-level coverage and explicitly validates Teams on supported runtimes', () => {
  const workflow = parse(readFileSync(path.join(repo, '.github/workflows/cd-samples.yml'), 'utf8'))
  assert.deepEqual(workflow.jobs['build-python'].strategy.matrix['python-version'], ['3.10', '3.x'])
  const teams = workflow.jobs['build-python-teams']
  assert.deepEqual(teams.strategy.matrix['python-version'], ['3.11.14', '3.x'])
  const script = teams.steps.find((step: { name: string }) => step.name === 'Validate nested Python Teams samples').run as string
  assert.match(script, /samples\/python\/teams\/\*\//)
  assert.match(script, /python_sample_ci\.py/)
  assert.match(script, /tests\/python-contracts/)
  assert.doesNotMatch(script, /find |\*\*\//)
})

test('sample CI explicitly builds nested Teams packages and runs their protected contracts on supported Node', () => {
  const workflow = parse(readFileSync(path.join(repo, '.github/workflows/cd-samples.yml'), 'utf8'))
  const build = workflow.jobs['build-node']
  assert.deepEqual(build.strategy.matrix['node-version'], [22, 'latest'])
  const script = build.steps.find((step: { name: string }) => step.name === 'Build all Node samples').run as string
  assert.match(script, /samples\/nodejs\/\*\/ samples\/nodejs\/teams\/\*\//)
  assert.doesNotMatch(script, /find |\*\*\/|node_modules/)
  assert.match(JSON.stringify(build.steps), /tests\/js-contracts/)
  assert.deepEqual(Object.keys(configuration(repo).profiles), ['dotnet', 'js', 'python'])
})
