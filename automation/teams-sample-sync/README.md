# Teams sample synchronization

Internal automation for adapting selected samples from `OfficeDev/Microsoft-Teams-Samples`
to the Agents SDK samples in this repository. This is not part of the customer plugin.

## Layout

- `src/`: the trusted CLI (`plan`, `migrate`, `verify-patch`).
- `actions/`: composite actions called by the GitHub workflow.
- `config/`: selected samples, ownership checks, and human-managed migration policies.
- `prompts/`: implementation and independent-review instructions.
- `skills/`: the internal sync skill and supporting references.
- `tests/unit/`: CLI and orchestration regression tests.
- `tests/contracts/`: protected behavior tests for existing samples.
- `state/`: version-2 checkpoints, advanced only through reviewed sync PRs.

The public migration and manifest skills remain under `agent-plugins/`; their paths are
configured in `config/targets.yml`. The internal skill is read explicitly from
[SKILL.md](skills/sync-teams-dotnet-samples-to-agents-sdk/SKILL.md), not installed in the public plugin.

## How it works

The [workflow](../../.github/workflows/sync-teams-dotnet-samples.yml) accepts manual dispatch
only. It keeps three separate jobs and their permissions:

1. **Plan:** pin the Teams commit and compare sample inputs with saved state.
2. **Migrate:** a read-only agent first derives expected behavior and manifest capabilities
   from the original evidence. The implementation agent then uses the migration skill first
   and the manifest skill second. Deterministic validation and a read-only final review check
   the candidate against that independent baseline. Repair remains limited to five cycles;
   one explicit recovery attempt is allowed when a repair produces no effective change before
   the no-progress circuit breaker stops repeated identical work.
3. **Publish:** apply and verify the approved patch, then create one draft PR per sample.
   This job does not use Copilot or run candidate sample code.

Plan and migrate have no repository-write credential. Agents cannot modify the automation,
policies, state, or protected tests. A blocked or rejected result creates no publishable
patch or state update. No schedule, automatic merge, or automatic addition of new samples.

## Run and test

From the repository root:

```sh
npm ci --prefix automation/teams-sample-sync
npm test --prefix automation/teams-sample-sync
npm run build --prefix automation/teams-sample-sync
dotnet test automation/teams-sample-sync/tests/contracts/TeamsSampleSync.ContractTests.csproj
```

Node.js 24 and .NET 8 are used in CI. Migration additionally requires the pinned Copilot
CLI installed by `actions/migrate/action.yml` and suitable Copilot credentials.
CLI commands, after checking out the desired Teams source into `.sync/upstream`:

```sh
node automation/teams-sample-sync/dist/cli.js plan --repo-root . --upstream-root .sync/upstream --sample agent-targeted-messages --output .sync/plan.json
node automation/teams-sample-sync/dist/cli.js migrate --repo-root . --upstream-root .sync/upstream --plan .sync/plan.json --sample agent-targeted-messages --max-attempts 5 --output-directory .sync/output/agent-targeted-messages
```

Use a clean isolated checkout for migration. `verify-patch` is run after applying the
artifact patch to the exact recorded Agents base commit; the publish action shows this sequence.

### GitHub and fork testing

Start with one sample and `createPr: false`. For fork testing, change
`TEAMS_SAMPLES_REPOSITORY` in the workflow to your fork and push the test change to its
`main` branch. Keep the fork history that contains the previous source commit.
The plan job checks out the Agents repository's default branch; selecting a different
dispatch branch alone does not change the CLI version used. Make sure the tested checkout
contains this automation layout. Never merge fork-only checkpoints into production.

Compare actual changed behavior, not only green workflow checks. See
[acceptance scenarios](skills/sync-teams-dotnet-samples-to-agents-sdk/references/acceptance.md).
All seven selected samples have a baseline contract. Migration selects tests using the
`Sample=<sample-name>` trait; a failed contract blocks publication. The shared test project
builds all referenced samples, but only the selected sample's tests execute in that migration.
Build, schema and HTTP startup checks do not prove complete functionality.

| Sample | Protected baseline behavior |
|---|---|
| `agent-targeted-messages` | Help is targeted to the requesting user, including suggested-action recipients |
| `bot-ai-messages` | Unknown input returns help |
| `bot-attachments` | Declined file consent returns the file-specific refusal and successful invoke acknowledgement |
| `bot-cards` | Card-actions command returns an adaptive card |
| `bot-meetings` | Meeting-start event returns the meeting title and join link |
| `bot-message-extensions` | Link query returns a card preview containing the requested URL |
| `bot-task-modules` | Custom-form fetch returns a dialog using the configured endpoint |

These tests send activities through the actual SDK routes. They do not call private
handlers, use tenant credentials, or test Graph calls, file transfer, background reminder
delivery or full Teams UI behavior. They protect existing behavior, not every possible
new source feature. Extend them through human-reviewed changes as required; the migration
agent cannot edit the tests. Bump `validatorVersion` when changing validation requirements
so already tracked samples are evaluated again.

Run one sample's contracts locally:

```sh
dotnet test automation/teams-sample-sync/tests/contracts/TeamsSampleSync.ContractTests.csproj --filter Sample=bot-meetings
```

## Policies and human review

Edit `config/migration-policy.yml` through a normal reviewed PR. Each policy has a unique
`key`, selected `sample`, `instruction`, `rationale`, and `source` (reviewed issue or PR).
Use policies for durable constraints, not routine implementation choices. Agents may add
useful sample-related functionality when they explain its benefit and evidence in the PR.

When the implementer needs a policy, the workflow summary contains a recommendation and
suggested YAML; no sync PR is created. Reviewer blockers appear as findings. PR comments
are not read as commands, and agent choices do not automatically become policies.

## Reports and troubleshooting

Artifacts contain `sync-result.json`, `source-context.json`, `agent-log.txt`, and
`workflow-summary.md`. Successful candidates also include `change.patch` and `pr-body.md`.
The PR shows changes, reasons, policies, validation, manual checks and collapsed traceability.
No `manifest-evidence.md` is written.

- No pending sample: compare the selected source, saved state and input digests.
- Invalid review report: the reviewer repairs its report within the shared budget.
- Rejected or blocked: read the result error, findings and agent log before rerunning.
- Existing open sync PR: review or close it; the publisher will not overwrite it.
- After this relocation: regenerate old pending patches, which refer to the former state path.

Model selection remains `auto` in `config/targets.yml`. Inspect available models and effort
levels with Copilot's interactive `/model` command before choosing an explicit model.
