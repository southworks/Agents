import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { combinedPrBody, failureReport, handoffIssueBody, issueTitle, prTitle, workflowSummary } from '../../src/report.js'
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

  it('keeps the PR description short and links to detailed evidence', () => {
    const first = result({
      sample: 'bot-cards',
      status: 'updated',
      publishable: true,
      summary: 'Added a card action and updated its manifest.',
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
      summary: 'Verified that no code changes were required.',
    })
    const runUrl = 'https://github.com/example/Agents/actions/runs/123'
    const artifactUrls = {
      'teams-sample-sync-bot-cards': `${runUrl}/artifacts/456`,
      'teams-sample-sync-bot-meetings': `${runUrl}/artifacts/789`,
    }
    const body = combinedPrBody([first, second], runUrl, artifactUrls)
    assert.equal(prTitle([first, second]), 'Sync Teams samples: bot cards and bot meetings')
    assert.equal(issueTitle([first]), 'Open PR for Teams sample: bot cards')
    assert.match(body, /bot-cards.*Added a card action/)
    assert.match(body, /bot-meetings.*Verified that no code changes/)
    assert.match(body, /<details>/)
    assert.match(body, /artifacts\/456/)
    assert.match(body, /artifacts\/789/)
    assert.match(body, /workflow summary and validation results/)
    assert.doesNotMatch(body, /self-audit\n|Teams sign-in|Frozen migration plan/)

    const issue = handoffIssueBody(
      [first, second],
      'automation/teams-sample-sync/run-123-1',
      'main',
      'example/Agents',
      runUrl,
      `${runUrl}/artifacts/999`
    )
    assert.match(issue, /PR creation from GitHub Actions and GitHub CLI is restricted here/)
    assert.match(issue, /Open one draft PR from/)
    assert.match(issue, /do not redo them/)
    assert.match(issue, /compare\/main\.\.\.automation%2Fteams-sample-sync%2Frun-123-1/)
    assert.match(issue, /artifacts\/999/)
    assert.doesNotMatch(issue, /Added a card action/)
  })
})
