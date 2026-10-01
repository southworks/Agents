import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { parse } from 'yaml'
import { record, targets } from '../../src/config.js'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('workflow configuration', () => {
  it('manual workflow choices match the configured samples', () => {
    const workflow = record(
      parse(readFileSync(path.join(repo, '.github/workflows/sync-teams-dotnet-samples.yml'), 'utf8')),
      'sync workflow'
    )
    const triggers = record(workflow.on, 'sync workflow on')
    const dispatch = record(triggers.workflow_dispatch, 'sync workflow workflow_dispatch')
    const inputs = record(dispatch.inputs, 'sync workflow inputs')
    const sample = record(inputs.sample, 'sync workflow sample input')
    const expected = ['all', ...Object.keys(targets(repo).samples)]

    assert.equal(sample.type, 'choice')
    assert.deepEqual(sample.options, expected)
  })

  it('scheduled runs assign one coordinated handoff to Copilot only after every migration succeeds', () => {
    const workflow = record(
      parse(readFileSync(path.join(repo, '.github/workflows/sync-teams-dotnet-samples.yml'), 'utf8')),
      'sync workflow'
    )
    const triggers = record(workflow.on, 'sync workflow on')
    const schedule = triggers.schedule as Array<{ cron?: unknown }>
    const jobs = record(workflow.jobs, 'sync workflow jobs')
    const plan = record(jobs.plan, 'sync workflow plan job')
    const publish = record(jobs.publish, 'sync workflow publish job')

    assert.deepEqual(schedule, [{ cron: '0 0 * * 0' }])
    assert.match(JSON.stringify(plan), /github\.event_name == 'schedule' && 'all' \|\| inputs\.sample/)
    assert.match(JSON.stringify(plan), /upstream-removed/)
    assert.match(String(publish.if), /github\.event_name == 'schedule' \|\| inputs\.publish/)
    assert.match(String(publish.if), /needs\.migrate\.result == 'success'/)
    assert.equal(publish.strategy, undefined)
    assert.match(JSON.stringify(publish), /prepare-handoff/)
    assert.match(JSON.stringify(publish), /prepare-issue/)
    assert.match(JSON.stringify(publish), /artifact-url/)
    assert.match(JSON.stringify(publish), /COPILOT_ASSIGNMENT_TOKEN/)
    assert.match(JSON.stringify(publish), /copilot-swe-agent\[bot\]/)
    assert.match(JSON.stringify(publish), /agent_assignment/)
    assert.match(JSON.stringify(publish), /current_base.*BASE_SHA/)
    assert.match(JSON.stringify(publish), /handoff-id\.txt/)
    assert.match(JSON.stringify(publish), /existing_number/)
    assert.doesNotMatch(JSON.stringify(publish), /git push origin/)
    assert.doesNotMatch(JSON.stringify(publish), /gh pr |publish-pr/)
    const steps = publish.steps as Array<{ name?: string; id?: string; run?: string; if?: string }>
    const reserve = steps.findIndex((step) => step.id === 'issue')
    const bundle = steps.findIndex((step) => step.name === 'Prepare consolidated handoff')
    const upload = steps.findIndex((step) => step.id === 'handoff')
    const assignment = steps.findIndex((step) => step.name === 'Complete handoff issue and assign Copilot')
    assert.ok(reserve < bundle && bundle < upload && upload < assignment)
    assert.doesNotMatch(steps[reserve]!.run!, /agent_assignment|assignees:/)
    assert.match(steps[bundle]!.run!, /--issue-number/)
    assert.match(steps[assignment]!.run!, /PATCH[\s\S]*\/assignees/)
    for (const step of steps.slice(bundle)) {
      assert.equal(step.if, "steps.issue.outputs.assigned != 'true'")
    }
    const verification = record(jobs['verify-publication'], 'publication verification')
    assert.equal(verification.if, "github.event_name == 'pull_request_target'")
    assert.match(JSON.stringify(verification), /pull_request.base.sha/)
    assert.doesNotMatch(JSON.stringify(verification), /pull_request.head.sha/)
    assert.match(String(plan.if), /github.event_name == 'schedule'/)
    assert.match(String(plan.if), /inputs.finalize_pr_number == ''/)
    assert.match(String(plan.if), /github.ref == format/)
  })

  it('finalizes completed Copilot runs or manual recovery without starting migration', () => {
    const workflow = record(parse(readFileSync(
      path.join(repo, '.github/workflows/sync-teams-dotnet-samples.yml'), 'utf8'
    )), 'sync workflow')
    const triggers = record(workflow.on, 'triggers')
    assert.deepEqual(triggers.workflow_run, { workflows: ['Running Copilot cloud agent'], types: ['completed'] })
    const dispatch = record(triggers.workflow_dispatch, 'manual dispatch')
    const inputs = record(dispatch.inputs, 'manual inputs')
    const recovery = record(inputs.finalize_pr_number, 'recovery PR number')
    assert.equal(inputs.finalize_pr, undefined)
    assert.equal(recovery.type, 'string')
    assert.equal(recovery.default, '')
    assert.equal(recovery.required, false)
    assert.match(String(recovery.description), /PR number.*Leave blank.*Automatic finalization does not use/)
    const jobs = record(workflow.jobs, 'jobs')
    const finalizer = record(jobs['finalize-publication'], 'finalizer')
    const verifier = record(jobs['verify-publication'], 'verifier')
    assert.match(String(finalizer.if), /workflow_run/)
    assert.match(String(finalizer.if), /inputs.finalize_pr_number != ''/)
    assert.equal(record(finalizer.permissions, 'finalizer permissions')['pull-requests'], 'write')
    assert.equal(record(verifier.permissions, 'verifier permissions')['pull-requests'], 'read')
    assert.equal(record(finalizer.permissions, 'finalizer permissions').checks, 'write')
    assert.deepEqual(finalizer.concurrency, verifier.concurrency)
    assert.equal(record(finalizer.concurrency, 'publication concurrency').queue, 'max')
    assert.match(JSON.stringify(finalizer), /PUBLICATION_MODE.*finalize/)
    assert.match(JSON.stringify(finalizer), /event.repository.default_branch/)
    assert.doesNotMatch(JSON.stringify(finalizer), /pull_request.head|workflow_run.head_sha/)
  })
})
