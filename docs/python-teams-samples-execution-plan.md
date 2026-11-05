# Python Teams samples execution and delegation plan

Create and test all seven Python Teams samples from pinned upstream source using the existing synchronization runtime and migration skills. Establish a reviewed initial implementation before relying on recurring synchronization. PR #118, its branch, generated files, patches, and state are excluded as implementation inputs.

This is an execution brief dated 2026-11-05. Planning does not launch migrations, assign agents, publish issues or PRs, change secrets, or merge anything. The deliverable of execution is a fresh, traceable implementation with independent automated evidence and explicit live-test results.

## Baseline and authoritative inputs

The inspected automation baseline is `122ad7abebc6b357286dab3a5e06c21374a033c3` on `agents/python-automation-workflow-plan`. It has the Python adapter, skills, seven protected suites, and prior runtime fixes. Neither `samples/python/teams` nor `automation/teams-sample-sync/state/python` exists in this checkout. Use this automation baseline, plus reviewed prerequisite changes, as the starting point. Record the resulting immutable base SHA before generation; do not silently follow a moving branch.

Read these inputs in each delegated task as applicable:

- [Synchronization skill](../automation/teams-sample-sync/skills/sync-teams-samples-to-agents-sdk/SKILL.md).
- [Python migration skill](../agent-plugins/agents-for-python/skills/teams-sdk-to-agents-sdk-python-migration/SKILL.md), including `references/behaviors.md` and `references/sdk-1.9.md`.
- [Manifest skill](../agent-plugins/agents-sdk-common/skills/teams-app-manifest/SKILL.md) and feature-specific references.
- [Generated ownership instructions](../.github/copilot-instructions.md), [automation README](../automation/teams-sample-sync/README.md), and [trusted Python setup](../automation/teams-sample-sync/scripts/PYTHON.md).
- [Existing implementation plan](python-teams-sync-implementation-plan.md) for parity requirements, and [behavior inventory](python-teams-sync-parity-inventory.md) as a checklist requiring reconciliation with actual source and tests.
- `automation/teams-sample-sync/config/targets.yml`, `config/ownership.yml`, `tests/python-contracts`, and the existing .NET/JS reference contracts.
- Canonical hosting input `samples/python/quickstart` and manifest assets `samples/python/proactive/appManifest`.

Resolve upstream `OfficeDev/Microsoft-Teams-Samples` once and freeze its exact commit for this execution. Source directories are `samples/TeamsSDK/<sample>/python/<sample>`. The old inventory pin `b9aedfea98e3505acbcf68a3931be05a780d6149` is historical evidence, not permission to claim that current source was inspected. Compare any newly selected source against the inventory and record differences.

Use the coordinator's frozen package map, not a manually chosen SDK version. Current configuration pins Python 3.11.14 and requires SDK >=1.9.0 within its supported selection policy. The release-specific 1.9.0 notes apply only when that release is selected; inspect the actual selected wheels for another release. No PR #118 code or old successful artifacts may substitute for fresh evidence.

## Execution method

The preferred first step is local execution of the existing CLI on an Ubuntu 24.04 environment matching CI, with Node 24 and the trusted Python tool environment. This separates sample implementation from GitHub assignment failures. Windows is possible but must use the exact interpreter and account for the previous path-length installation issue.

An execution worker operates the coordinator; the coordinator starts the persistent Copilot implementation session and supplies `validate_sample`. Reading a skill in an ordinary coding session does not provide that tool or establish the frozen-plan protocol. Do not ask independent workers to hand-write generated directories outside that process.

The runtime supports initial imports into empty destinations. Its first agent turn inventories source and writes a per-sample migration plan without write access. The coordinator freezes that plan and then authorizes implementation. No handoff issue is needed to start this runtime implementation. A later publication phase consumes verified output.

Keep one owner for shared automation, contracts, and skills. Give each sample execution its own checkout at the same approved base, its own output directory, and the same immutable upstream and global plan. Do not run concurrent samples in one dirty checkout. Delegated workers must use the orchestrator's checkout isolation when available.

## Work package 0 Prepare and freeze the execution inputs

Owner: one automation preparation worker. Complete before sample implementation.

1. Confirm applicable repository instructions, a clean baseline, absent Python destinations/state, and no PR #118 ancestry or imported files in the chosen execution base. Preserve unrelated user work.
2. Install the trusted tools using `scripts/PYTHON.md` and the workflow setup action. Select the exact Python 3.11.14 executable with `TEAMS_SYNC_PYTHON`; do not use an ambient Python 3.12 interpreter.
3. Run the automation build, tests, lint, and Python helper tests. Inspect failures before treating the automation as a reliable validator.
4. Read each protected suite and reconcile it against pinned upstream source and the behavior inventory. Replace obsolete blanket “pending” test descriptions with exact suite/test references and genuine gaps. Keep implementation status pending until candidates exist.
5. Repair demonstrated contract, canonical-input, or skill defects before freezing generation inputs. Tests must exercise actual SDK routing, invoke serialization, transport behavior, and failure paths. Never relax assertions to accommodate an incorrect candidate.
6. Confirm local Copilot authentication without exposing credentials. For hosted execution, inspect the current automatic-token/fallback behavior and issue-assignment setup separately. The current workflow reuses `COPILOT_ASSIGNMENT_TOKEN` for CLI fallback; separate credentials if the account/repository access arrangement requires it. Any such change is a reviewed prerequisite, not an assumed existing capability.
7. Commit reviewed shared changes, record the final base SHA, pin upstream, resolve SDK packages once, and create the global Python plan. It must select all seven targets as pending initial imports. Distribute this exact plan and input manifest to execution workers.

Exit evidence: base and upstream SHAs, tool versions, global `plan.json`, frozen SDK selection, baseline check results, reconciled behavior-to-test inventory, and a list of unresolved blockers. Missing credentials, unavailable wheels, missing source, or invalid contracts block execution rather than authorize guessed implementations.

## Work package 1 Complete the cards pilot

Owner: one sample execution worker, followed by an independent reviewer.

Run the coordinator for `bot-cards` first. Require the complete sample layout: `requirements.txt`, trusted resolver-produced `requirements.lock`, `src/agent.py`, `src/main.py`, supporting modules, configuration template, README, manifest and icons. Use `create_agent(dependencies=None)` and actual SDK routes.

The pilot must establish correct constructor/dependency injection, import without network or timers, credential-free readiness, authenticated message processing, source/manifest command alignment, and an independently runnable setup. Check lazy defaults: `dict.get(key, constructor())` still executes the constructor when an override exists. Do not assign the read-only connection manager property.

Cover both card commands, precedence, nested form data, initially hidden visibility targets, name/missing-name submissions, invoke envelopes, and fallback help. The reviewer must compare code, frozen plan, pinned source, README and manifest, not merely read the passing test summary.

Exit gate: current full validation, independent patch verification, complete self-audit, and no unresolved pilot defects. Record any shared lesson in guidance before proceeding. If shared guidance or contracts change, commit them, regenerate the global plan, and rerun the pilot against the new fingerprints. Do not reuse incompatible evidence.

## Work package 2 Implement the remaining samples

After the pilot gate, these are independent sample tasks. Run only as many concurrently as the available isolated environments and Copilot quota support. Prefer AI messages, extensions and dialogs first; then attachments, meetings and targeted messages. Each owns only `samples/python/teams/<sample>/**`; the coordinator alone produces synchronization state.

### Task A AI messages

Preserve keyword precedence, AI labels, sensitivity metadata, complete citations, custom feedback metadata, feedback submission and the Python source's feedback-fetch dialog. Use explicit invoke responses where generic SDK handlers do not serialize returned dictionaries. Verify unknown-input help and both feedback protocol routes. Suite: `tests/python-contracts/bot-ai-messages.py`.

### Task B Message extensions

Implement Wikipedia search with the exact command ID, sanitized snippets, adaptive cards and thumbnail previews. Preserve link unfurling for the requested URL, compose help and manifest contexts/domains. Empty results and unknown commands must return a valid no-results invoke envelope. Keep real SDK dispatch when injecting the search transport and give specific commands precedence over fallback. Suite: `tests/python-contracts/bot-message-extensions.py`.

### Task C Task modules

Implement adaptive input, custom form and multi-step dialogs. Preserve `activity.value.data.verb` action identifiers, name/email state carry-forward and completion envelopes. Serve the real `/customform` page at the returned URL and align `fallbackUrl`, endpoint configuration and manifest domains. Documentation must distinguish dialogs from slash/mention commands. Suite: `tests/python-contracts/bot-task-modules.py`.

### Task D Attachments

Preserve bytes, filenames, size and consent context. Acknowledge acceptance before a deliberately blocked upload completes; perform subsequent delivery through supported proactive continuation with captured conversation identity. Preserve upload headers/status handling and final file-info delivery. Clear pending data on decline/failure and drain or cancel tracked background tasks. Exercise real local HTTP helpers, not only injected mocks. Review download/resource lifecycle risks and agree any additional limits from requirements; do not copy unexplained policies from PR #118. Suite: `tests/python-contracts/bot-attachments.py`.

### Task E Meetings

Preserve start title/time/join action, participant roles and AAD filtering. Keep IDs through typed SDK conversion; implement missing-metadata and join-URL/resource fallback. Verify the initial 30-second delay, 10-second retry delays and three attempts using injected waits. Select the newest transcript, use the complete configured Graph beta users/onlineMeetings route with `Accept: text/vtt`, and parse VTT. Lazy credentials must allow import/readiness without tenant configuration. Align subscriptions, RSC and Graph setup with source evidence. Suite: `tests/python-contracts/bot-meetings.py`.

### Task F Targeted messages

Implement mention-based reminders, private confirmation, captured recipient/conversation, delayed delivery, user-scoped listing/cancellation, and card cancel/dismiss/snooze with valid invokes. Preserve suggested-action routing, help metadata and reaction target precedence. Reject invalid/overflow times, isolate application state and cancel timers on shutdown. Record the Python source-specific reaction-removal acknowledgement rather than silently forcing JS behavior. Keep state in memory and document restart limitations. Suite: `tests/python-contracts/agent-targeted-messages.py`.

For all tasks, the final migration plan must map each required behavior to its upstream path/symbol, destination change, SDK mapping, exact protected test and manifest/setup impact. A claim that the manifest needs no change requires the relevant JSON path and value. Missing SDK support needs concrete release evidence and an explicit scope decision; no silent feature removal.

## Common delegation brief

Use this brief for each sample, replacing the values with work package 0 outputs and the assigned sample requirements above:

> Execute the existing Python synchronization runtime for SAMPLE from the approved clean base BASE_SHA, upstream UPSTREAM_SHA and supplied immutable global plan. Start with an empty destination. Do not use PR #118, its branch, patches, generated files or synchronization state. Read the synchronization, Python migration and manifest skills. Run the coordinator so its persistent implementation session creates and freezes a behavior-complete plan before edits. Implement only the assigned sample, preserve real SDK dispatch and source behavior, and use the runtime's validate_sample groups code, manifest and all. Do not modify shared tools, contracts, another sample or frozen evidence. Report prerequisites to the preparation owner. Return the candidate patch, full validation result, source context, frozen migration plan, self-audit, tool diagnostics, exact input identities and remaining manual checks. Do not publish or merge unless separately assigned the publication task.

The reviewer brief is separate:

> Review SAMPLE against its frozen plan, pinned upstream and parity inventory. Inspect final code, manifest and documentation. Check factory/hosting/authentication, route precedence and response envelopes, dependency locks, background lifecycle, negative paths and test coverage. Independently verify the patch and rerun relevant checks. Report actionable defects with file locations and distinguish defects from untested tenant behavior. Do not change generated files or accept a self-audit as proof. Return pass/block with evidence.

## Commands for execution workers

Commands below run from the execution checkout root. Paths assume Ubuntu and the trusted environment already prepared. They are instructions for the future execution task, not checks performed while writing this plan.

```sh
export TEAMS_SYNC_PYTHON="$PWD/.sync/python-tools/bin/python"
npm ci --prefix automation/teams-sample-sync
npm run build --prefix automation/teams-sample-sync
npm test --prefix automation/teams-sample-sync
npx eslint automation/teams-sample-sync
"$TEAMS_SYNC_PYTHON" -I -m unittest discover -s automation/teams-sample-sync/scripts -p 'test_python_*.py'
```

The preparation owner fetches upstream into `.sync/upstream` and checks out the recorded exact commit. Create the global plan once; omitting `--sample` selects all configured Python targets:

```sh
node automation/teams-sample-sync/dist/cli.js plan \
  --repo-root . --upstream-root .sync/upstream \
  --language python --output .sync/plan.json
```

Each sample checkout receives the unchanged global plan and upstream at that exact commit. Configure `GITHUB_TOKEN` securely for the CLI; do not put a token in command text, logs or the delegation prompt. Example pilot invocation:

```sh
node automation/teams-sample-sync/dist/cli.js migrate \
  --repo-root . --upstream-root .sync/upstream --plan .sync/plan.json \
  --language python --sample bot-cards \
  --output-directory .sync/output/python--bot-cards
```

`validate_sample` is available inside the runtime, not as a standalone shell command. For a supplementary independent sample CI check after output exists:

```sh
"$TEAMS_SYNC_PYTHON" -I automation/teams-sample-sync/scripts/python_sample_ci.py \
  samples/python/teams/bot-cards automation/teams-sample-sync/tests/python-contracts
```

This supplementary check does not replace the coordinator's full validator, output digest, state or patch verification. Repeat with the assigned sample name. A successful local execution needs no GitHub issue-assignment credential.

## Work package 3 Independently verify and integrate

Owner: one integration worker, after all selected samples pass review.

1. Collect each complete output directory: `change.patch`, `sync-result.json`, `migration-plan.md`, `self-audit.md`, `source-context.json` and diagnostics. Verify a common base, upstream and compatible frozen inputs; reject missing or failed evidence.
2. For each sample, apply its patch with `git apply --index --binary` in a fresh verification checkout at the recorded base. Run the CLI `verify-patch` with that checkout as `--repo-root`, the correct language/sample, and an absolute path to its `sync-result.json`. Verification expects HEAD to remain the original base; do this before committing the patch.
3. Follow the existing publication logic in `.github/workflows/sync-teams-dotnet-samples.yml` for the selected set. Preserve checks for allowed paths, frozen plans, current output, state and base movement. Use `prepare-handoff` to build a coordinated bundle; it does not create an issue or a PR.
4. Integrate only verified patches through the synchronization publication process. An assigned integration task may import the exact verified artifacts and prepare a fresh baseline PR; it must preserve provenance and rerun the final combined checks. Generated-code adjustments return to the synchronization runtime or an authorized workflow handoff, followed by full validation and renewed evidence. Never hand-edit synchronization state or reuse a prior digest after an edit.
5. If using the existing hosted Copilot handoff instead, dispatch Python generation/publication from the actual default branch. The workflow has no input for importing the local bundle: a new run can generate different output and must be reviewed again. Do not pretend it publishes the locally reviewed files unchanged. Do not remove the default-branch guard to make a trial run.
6. Keep the new baseline PR in draft while correctness blockers remain. Report automated results, exact artifact provenance, sample behavior coverage and pending tenant checks. Do not merge or close PR #118 as part of generation; its disposition is separate repository administration.

If the target base moves or shared inputs change, regenerate against the chosen new base and revalidate. Do not mix patches from incompatible runs to obtain a passing bundle. The current CLI is not a generic direct-PR publisher; use an explicitly assigned integration task or the existing hosted handoff, not an invented CLI command.

## Work package 4 Test live sample behavior

Owner: a tester with the required Teams, Azure Bot and Graph environment. Can start for reviewed samples while other samples finish, but must record the exact tested candidate revision.

For every sample, follow its README from a clean environment, substitute documented manifest placeholders, create the ZIP with manifest/icons at its root, install it in the declared scope, and verify authenticated activity delivery. Keep credentials out of committed files and evidence.

- Cards: both commands, visibility actions and submitted names.
- AI messages: labels, citations and the custom feedback dialog/submission.
- Extensions: compose search, no results and supported link previews.
- Dialogs: all three launch/submit flows, including the hosted custom page.
- Attachments: real consent accept/decline, upload and final file delivery; record failure handling where safely reproducible.
- Meetings: real start/participant/end events, permitted Graph transcript access and unavailable-transcript handling.
- Targeted messages: correct recipient delivery, cancellation/snooze, isolation between users and reactions in supported scopes.

Report each scenario as passed, failed or blocked with revision, environment and reproducible observations. Mocked local contracts cannot establish these results. Document missing permissions/configuration as blockers rather than as successful tests.

## Work package 5 Verify incremental operation

After the reviewed baseline and its verified state are integrated, create a new plan using identical upstream, SDK selection and automation inputs. It should select no unchanged samples for migration. Investigate unexpected regeneration rather than accepting churn.

In an isolated test environment, exercise a genuine changed input and verify that affected samples are selected and revalidated. Existing fixture tests may cover policy branches; do not manufacture state or change generated files on the published baseline merely to force a demonstration. Record the distinction between unchanged inputs skipped by planning and a selected migration that validates a no-code-change, state-only result.

## Completion criteria

The initial implementation is ready for acceptance when all seven samples have reviewed behavior coverage, runnable assets/setup, trusted dependency locks, current full automated validation, independent patch verification and a clean combined integration result. Live scenarios must have recorded outcomes; any blocked tenant check remains explicitly incomplete. Routine synchronization is proven separately by work package 5.

Each worker returns exact input/candidate identities, changed paths, test commands/results, defects or blockers, and remaining manual checks. Passing tests alone does not demonstrate complete parity. No evidence, output, review result or successful status from PR #118 counts toward this execution.
