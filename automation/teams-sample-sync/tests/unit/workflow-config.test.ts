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
    assert.deepEqual(Object.keys(jobs), ['plan', 'migrate', 'publish'])
    assert.equal(triggers.pull_request_target, undefined)
    assert.equal(triggers.workflow_run, undefined)
    assert.equal(record(record(triggers.workflow_dispatch, 'dispatch').inputs, 'inputs').finalize_pr_number, undefined)
    assert.match(String(plan.if), /github.event_name == 'schedule'/)
    assert.match(String(plan.if), /github.ref == format/)
  })

  it('uses a separate PR-triggered finalizer without skipped migration jobs', () => {
    const workflow = record(parse(readFileSync(
      path.join(repo, '.github/workflows/finalize-teams-sync-pr.yml'), 'utf8'
    )), 'post workflow')
    const triggers = record(workflow.on, 'triggers')
    assert.deepEqual(triggers.pull_request_target, { types: ['opened', 'synchronize', 'edited', 'reopened', 'ready_for_review'] })
    assert.equal(triggers.workflow_run, undefined)
    assert.equal(triggers.schedule, undefined)
    const dispatch = record(triggers.workflow_dispatch, 'manual dispatch')
    const inputs = record(dispatch.inputs, 'manual inputs')
    const recovery = record(inputs.finalize_pr_number, 'recovery PR number')
    assert.equal(inputs.finalize_pr, undefined)
    assert.equal(recovery.type, 'string')
    assert.equal(recovery.default, '')
    assert.equal(recovery.required, true)
    assert.match(String(recovery.description), /PR number.*Automatic finalization does not use/)
    const jobs = record(workflow.jobs, 'jobs')
    assert.deepEqual(Object.keys(jobs), ['finalize-publication'])
    const finalizer = record(jobs['finalize-publication'], 'finalizer')
    assert.equal(finalizer.if, undefined)
    assert.equal(record(finalizer.permissions, 'finalizer permissions')['pull-requests'], 'write')
    assert.equal(record(finalizer.permissions, 'finalizer permissions').checks, 'write')
    assert.match(String(record(finalizer.concurrency, 'concurrency').group), /pull_request.number.*inputs.finalize_pr_number/)
    assert.equal(record(finalizer.concurrency, 'publication concurrency').queue, 'max')
    assert.match(JSON.stringify(finalizer), /PUBLICATION_MODE.*finalize/)
    assert.match(JSON.stringify(finalizer), /event.repository.default_branch/)
    assert.doesNotMatch(JSON.stringify(finalizer), /pull_request.head|workflow_run/)
  })
})
