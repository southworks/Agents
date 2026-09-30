import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { combinedPrBody, failureReport, handoffIssueBody, workflowSummary } from '../../src/report.js'
import type { SyncResult } from '../../src/types.js'

function result (overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    version: 4,
    sample: 'bot-message-extensions',
    status: 'failed',
    publishable: false,
    baseSha: 'base',
    previousUpstreamCommit: null,
    upstreamCommit: 'upstream',
    upstreamChanges: [],
    changedComponents: [],
    copilot: { sdkVersion: '1.0.7', runtimeVersion: '1.0.83' },
    observedModels: [],
    sourceTree: 'tree',
    sourceContextDigest: 'context',
    inputDigest: 'input',
    componentDigests: {},
    diagnostics: [],
    ...overrides,
  }
}

describe('synchronization reports', () => {
  it('renders a failed synchronization for stderr and GitHub annotations', () => {
    const report = failureReport(
      result({
        sample: 'bot:message,extensions',
        error: 'Only released Teams manifest schema URLs are supported\n100% checked',
      })
    )

    assert.deepEqual(report, {
      stderr:
        'Sample synchronization failed (bot:message,extensions): Only released Teams manifest schema URLs are supported\n100% checked',
      annotation:
        '::error title=bot%3Amessage%2Cextensions synchronization failed::Only released Teams manifest schema URLs are supported%0A100%25 checked',
    })
  })

  it('falls back to diagnostics when a failed result has no primary error', () => {
    assert.deepEqual(failureReport(result({ diagnostics: ['Validation failed'] })), {
      stderr: 'Sample synchronization failed (bot-message-extensions): Validation failed',
      annotation: '::error title=bot-message-extensions synchronization failed::Validation failed',
    })
  })

  it('does not render a failure report for a publishable result', () => {
    assert.equal(failureReport(result({ status: 'updated', publishable: true })), undefined)
  })

  it('workflow summary identifies the uploaded diagnostic artifact', () => {
    assert.match(workflowSummary(result()), /Diagnostic artifact: `teams-sample-sync-bot-message-extensions`/)
  })

  it('escapes every backslash in Markdown-safe diagnostic output', () => {
    const summary = workflowSummary(result({ diagnostics: ['first\\second\\third'] }))
    assert.match(summary, /first\\\\second\\\\third/)
  })

  it('combines sample reports and lists shared external validation once', () => {
    const first = result({
      sample: 'bot-cards',
      status: 'updated',
      publishable: true,
      validation: {
        version: 2,
        id: 'first',
        sample: 'bot-cards',
        passed: true,
        repairable: false,
        outputDigest: 'first',
        group: 'all',
        checks: { build: { status: 'passed', errors: [] } },
        errors: [],
        externalValidationRequired: ['Teams sign-in'],
      },
    })
    const second = result({
      ...first,
      sample: 'bot-meetings',
      status: 'no-changes',
    })
    const body = combinedPrBody([first, second])
    assert.match(body, /### bot-cards/)
    assert.match(body, /### bot-meetings/)
    assert.match(body, /No sample changes required/)
    assert.equal(body.match(/Teams sign-in/g)?.length, 1)
    assert.equal(body.match(/## Teams SDK sample synchronization/g)?.length, 1)

    const issue = handoffIssueBody(
      [first, second],
      'automation/teams-sample-sync/run-123-1',
      'main',
      'example/Agents',
      'https://github.com/example/Agents/actions/runs/123'
    )
    assert.match(issue, /Create one draft PR from/)
    assert.match(issue, /do not redo them/)
    assert.match(issue, /compare\/main\.\.\.automation%2Fteams-sample-sync%2Frun-123-1/)
  })
})
