# Python Teams sample synchronization implementation plan

## Objective and completion boundary

Extend `automation/teams-sample-sync` so Python has the same synchronization lifecycle and substantially equivalent sample behavior as .NET and JavaScript/TypeScript. Keep the coordinator in TypeScript. Add Python through the existing language profile and validation adapter design.

The final deliverable includes all seven sample families, migration guidance, dependency resolution, protected Python contracts, incremental state, independent patch verification, coordinated handoff, workflow selection, and CI. A cards-only pilot is an implementation checkpoint, not completion. Python-specific SDK APIs and idiomatic code may differ; observable functionality, validation strength, and publication guarantees must remain equivalent.

This is a worker brief for future implementation. It does not itself trigger workflows, publish issues or PRs, or change generated samples. All prose, code comments, documentation, and reports must be in English.

## Repository and base

Repository: <https://github.com/southworks/Agents>.

The reviewed stack is:

- [PR 101](https://github.com/southworks/Agents/pull/101): coordinated verified patch handoff, cancellation, CI, and snapshot cleanup.
- [PR 102](https://github.com/southworks/Agents/pull/102): .NET Teams SDK 1.9 migration and transport/behavior contracts.
- [PR 103](https://github.com/southworks/Agents/pull/103): TypeScript migration guidance and plugin metadata.
- [PR 104](https://github.com/southworks/Agents/pull/104): TypeScript AI messages, cards, message extensions, dialogs, shared contracts, and nested sample CI.
- [PR 105](https://github.com/southworks/Agents/pull/105): attachments, file consent, and asynchronous upload contracts.
- [PR 106](https://github.com/southworks/Agents/pull/106): meeting events, Graph transcripts, and contracts.
- [PR 107](https://github.com/southworks/Agents/pull/107): targeted reminders, reactions, timers, and contracts.
- [PR 108](https://github.com/southworks/Agents/pull/108): language profiles, qualified identities/state, shared coordinator, and .NET adapter extraction.
- [PR 109](https://github.com/southworks/Agents/pull/109): JavaScript adapter, frozen npm selection, seven targets, and mixed-language verification.
- [PR 116](https://github.com/southworks/Agents/pull/116): generated-sample ownership, SDK compatibility obligations, and final-candidate validation.

PRs 111–115 are closed outputs from the older synchronization process, not additional foundation layers. PR 110 was unavailable during assessment; do not infer a dependency on it.

Reference base inspected: PR 116 head `7e367ce66552feb9c934a492615a841b40915a3f`, branch `southworks/update/teams-sync-generated-ownership`. This SHA records the assessment baseline, not a requirement to ignore subsequent corrections. Before implementation, read the current stack heads and discussions. Use the updated tip of PR 116 while the stack remains open, or `main` once the complete stack has landed. Confirm the language-profile implementation is present before editing. Do not implement against the older .NET-only checkout or cherry-pick only PR 109.

The planning checkout was on `agents/python-automation-workflow-plan`, at `8171bc7e0ca3b8defd578a6bb317367c2901983f`; it did not contain the reviewed stack in its working tree. The implementation worker must establish the correct base rather than assuming the supplied checkout already has it. Preserve this plan when moving to the implementation base.

## Read before implementation

Read these files at the implementation base:

- `.github/copilot-instructions.md`, `automation/teams-sample-sync/README.md`, and applicable `AGENTS.md` files.
- `config/targets.yml`, `config/ownership.yml`, `src/identity.ts`, `src/types.ts`, `src/config.ts`, and `src/languages.ts` under `automation/teams-sample-sync`.
- `src/language-validation.ts`, `src/js-validation.ts`, `src/js-project.ts`, `src/js-versions.ts`, `src/js-capabilities.ts`, and the corresponding .NET modules.
- `src/sdk-policy.ts`, `src/plan.ts`, `src/plan-inputs.ts`, `src/context.ts`, `src/state.ts`, `src/candidate.ts`, `src/validate.ts`, and `src/validation-process.ts`.
- `src/guard.ts`, `src/agent-tools.ts`, `src/agent-runner.ts`, `src/sync-session.ts`, `src/verify-patch.ts`, `src/publish-bundle.ts`, `src/handoff-bundle.ts`, and `src/report.ts`.
- `tests/contracts`, `tests/js-contracts`, `tests/integration`, and the profile/state/workflow/manifest/version unit tests.
- `.github/workflows/sync-teams-dotnet-samples.yml`, `.github/workflows/ci-teams-sample-sync.yml`, and `.github/workflows/cd-samples.yml`.
- The .NET and TypeScript migration skills, the shared synchronization skill, and the shared Teams manifest skill.
- `samples/python/quickstart`, `samples/python/proactive/appManifest`, and `agent-plugins/CONTRIBUTING.md`.

Paths beginning with `src/`, `config/`, or `tests/` in the rest of this document are relative to `automation/teams-sample-sync` unless explicitly qualified.

## Architecture to preserve

The shared lifecycle is: select and fingerprint inputs; freeze a read-only migration plan; implement within one selected sample; self-audit; independently validate; perform the existing bounded repair/reconciliation; produce a verified patch and state; verify each patch against the planned base; bundle all selected results; create or reuse the Copilot handoff issue.

Reuse that lifecycle without a parallel Python coordinator or separate Python-only publication workflow. Preserve:

- Exact upstream commit selection and immutable source context. Planning fetches Git metadata without executing upstream code.
- Language-qualified IDs, artifacts, state, concurrency groups, and result validation.
- A single persistent implementation session, frozen plan hash, write confinement, full validation, bounded repair, outcome reconciliation, deadlines, and process cancellation.
- SDK compatibility repairs inside the migration plan; no downgrades, capability removal, weakened contracts, or suppressed diagnostics to force success.
- State-only patches for verified no-change outcomes, with accurate summaries.
- No verified-state advancement or successful publication on a failed, missing, stale, or mismatched check.
- Coordinated publication: failure of any selected language/sample blocks the entire selected handoff.
- Base-movement checks, output-bound handoff deduplication, artifact/evidence retention, and manual assignment fallback when no assignment token exists.
- Migration without repository-write credentials; publication without running candidate code or Copilot sessions.
- Auto model routing and existing Copilot SDK/runtime policy. Python integration does not require model selection or a new reviewer session.

## Work package 1: Establish the parity inventory

Upstream configuration currently points to `OfficeDev/Microsoft-Teams-Samples`, ref `main`, root `samples/TeamsSDK`. All seven families have a Python directory. Resolve and record a specific upstream commit, then verify each configured source directory at that commit before implementation.

Expected source and destination mapping:

| Sample | Expected source relative to upstream root | Destination |
| --- | --- | --- |
| agent-targeted-messages | agent-targeted-messages/python/agent-targeted-messages | samples/python/teams/agent-targeted-messages |
| bot-ai-messages | bot-ai-messages/python/bot-ai-messages | samples/python/teams/bot-ai-messages |
| bot-attachments | bot-attachments/python/bot-attachments | samples/python/teams/bot-attachments |
| bot-cards | bot-cards/python/bot-cards | samples/python/teams/bot-cards |
| bot-meetings | bot-meetings/python/bot-meetings | samples/python/teams/bot-meetings |
| bot-message-extensions | bot-message-extensions/python/bot-message-extensions | samples/python/teams/bot-message-extensions |
| bot-task-modules | bot-task-modules/python/bot-task-modules | samples/python/teams/bot-task-modules |

Create a traceable feature checklist from the union of the existing .NET and JS implementations/contracts and the pinned upstream Python sources. For each behavior, record source evidence, Python implementation location, protected test, manifest/setup implications, and any real SDK limitation. The checklist below is the minimum, not a substitute for inspecting source. Differences in upstream Python behavior must be explained; do not silently drop a feature already provided in the other languages. If resolving a genuine SDK gap requires a scope decision, report the exact gap and options rather than claiming parity.

### Cards

- Card-action and toggle-visibility commands, command matching and precedence, nested form content, initially hidden elements, and correct visibility target IDs.
- Name submission and missing-name behavior, correct invoke response shape/status, and fallback help advertising both commands.
- Handler, README, and manifest command titles/surfaces agree.

### AI messages

- AI-generated labels, sensitivity metadata, feedback metadata, citations including claim/source URL/keywords/card, and route precedence when text contains multiple keywords.
- Feedback invokes preserve reaction and feedback content; unknown messages return stable help.

### Message extensions

- Wikipedia search with the correct command ID, adaptive-card results, sanitized snippets, thumbnail previews, and no-results behavior for empty results/unknown commands.
- Link unfurling includes the requested URL; declared domains match supported URLs, including `en.wikipedia.org` where configured.
- Compose instructions and help; correct query/link invoke response envelopes and manifest command contexts.

### Task modules and dialogs

- All three launch actions: adaptive input, custom form, and multi-step form.
- Fetch selects the correct input card or custom URL/fallback URL; the custom-form route serves the actual Teams dialog page.
- Multi-step state carries the name into the email step and completes with the expected message; custom/text submissions preserve their response envelopes.
- Manifest and README distinguish dialog actions from slash/mention commands.

### Attachments

- Downloaded bytes, filenames, sizes, and context survive through consent and upload; upload helpers preserve required headers and failure handling.
- Consent acceptance acknowledges before slow upload completes, then uses proactive continuation and sends the file-info result.
- Consent decline and failed uploads clean up pending data; ordinary messages retain useful help and agent terminology.
- Appropriate file capability/manifest flags and configuration instructions.

### Meetings

- Start events preserve title, timestamp, and join action. Participant join/leave preserves role information and ignores agent-only payloads without an AAD user ID.
- Metadata and Graph identifiers survive SDK payload conversion; meeting-end processing handles missing metadata and join-URL/resource fallback.
- Transcript delay/retry behavior, newest-transcript selection, expected Graph route, VTT parsing, and clear fallback when unavailable.
- Required meeting subscriptions and resource-specific permissions are documented and reflected in the manifest.

### Targeted messages

- Reminder creation with mentions and private confirmation; delayed proactive delivery to the intended recipient; captured identity/conversation context.
- User-scoped reminder listing and cancellation ownership; card cancel/dismiss/snooze with valid invoke acknowledgements and cancellable timers.
- Suggested-action invokes share routing with text commands; help/fallback retains suggested actions, AI labels, and targeted prompt-preview metadata.
- Reaction commands resolve quoted-message ID, reply ID, then current-message ID in the existing precedence; preserve slash-command restrictions and actual Teams API transport behavior.
- Added-reaction acknowledgement and removal behavior; invalid times/overflow do not schedule; independent application instances do not share reminder state; timers are cleaned up.
- Retain the samples' in-memory state model and document its limitations. Do not introduce persistence infrastructure as part of parity.

## Work package 2: Python migration guidance and sample conventions

Add `agent-plugins/agents-for-python/skills/teams-sdk-to-agents-sdk-python-migration/SKILL.md` and focused reference material as needed. Cover every sample above, package/import mappings, application construction, authentication, aiohttp startup, Teams extension registration, typed payloads, outbound/proactive transport, manifests, async lifecycle, and validation commands.

Use the existing Python quickstart as the canonical hosting reference and the proactive manifest assets as the proposed asset source. Verify that these inputs provide the needed files and compatible SDK APIs. If a canonical helper needs maintenance, make that an explicit prerequisite; the migrating agent must not fetch an unpinned helper or modify a sibling sample. Add a local readiness route if required by the shared smoke contract, which currently expects `GET /` to return 200, while retaining `/api/messages` and normal authentication behavior.

Each generated sample must be independently runnable and include source, dependency declarations and resolver-produced lock evidence, configuration template, README, manifest, icons, and additional web assets needed for its behavior. Make application construction importable without binding a port or starting timers on import. Provide explicit startup and cleanup for background work. Preserve actual SDK routing in tests.

Follow plugin contribution/versioning conventions: update the Python plugin metadata, its `.claude-plugin` manifest and marketplace version where applicable, and plugin documentation. Skills are discovered through `skills/`; do not invent a manual registration mechanism. Reuse the shared manifest and synchronization skills rather than copying them.

## Work package 3: Runtime and dependency policy

Choose an explicit supported Python minor for synchronization after checking the selected SDK and dependencies. Existing sample CI declares Python 3.10 and `3.x`; do not assume every new SDK/dependency supports that minimum. Preserve existing sample coverage, and document and test any deliberate Teams-specific runtime requirement. Keep synchronization reproducible rather than using a moving interpreter alias there.

Resolve the required Python SDK packages from authoritative release/package metadata. Initial candidates include `microsoft-agents-activity`, `microsoft-agents-hosting-core`, `microsoft-agents-hosting-aiohttp`, `microsoft-agents-authentication-msal`, and `microsoft-agents-hosting-msteams`; confirm the final required set against the release used. Current extension documentation is at <https://github.com/microsoft/Agents-for-python/blob/main/libraries/microsoft-agents-hosting-msteams/readme.md>. Verify the release-specific API before implementing. Do not assume the older `microsoft-agents-hosting-teams` package is equivalent, and do not reject a legitimate transitive Teams API/model dependency just because it contains the word Teams.

Implement `src/python-versions.ts` and the matching selection assertion/dispatch. Requirements:

- Select compatible stable releases within the configured supported major and at or above the Python-specific minimum; never copy the .NET or npm minimum blindly.
- Understand Python version ordering, specifiers, package-name normalization, `Requires-Python`, dependency markers, extras where used, and yanked/prerelease exclusions. Use a maintained Python packaging/resolution implementation rather than translating npm semver rules.
- Freeze the complete required SDK package map and a stable release-selection identity in the plan/context/results. Bind the actual package selection into input fingerprints. Revalidation must detect an SDK selection change even if the headline version stays the same.
- Verify declarations, resolved lock evidence, and installed distribution versions against the frozen selection. Fail on missing or conflicting SDK packages and unsatisfiable requirements.
- Use one isolated environment per sample validation. Do not reuse dependencies installed by another sample or trust a candidate-supplied environment, executable, `.pth` file, or bytecode cache.
- Let trusted validation tooling produce lock evidence with exact versions and hashes. Prefer a requirements-compatible workflow consistent with existing samples; document the chosen resolver and lock format, pin its tool version, and use it consistently in local validation and CI.
- Keep package sources explicit. Reject candidate-controlled alternate indexes, editable/VCS/local-path requirements, nested requirements escaping the sample, and arbitrary install/build hooks. Prefer verified wheels; any unavoidable source-build dependency requires an explicit supported policy rather than uncontrolled candidate execution during preparation.
- Retain source/declarations/lockfiles in patch digests. Exclude only generated environments, bytecode, test caches, and coverage output.
- Bound metadata/download/resolution operations, sanitize subprocess environments, and distinguish infrastructure failures from repairable sample failures.

If package-policy or AST helpers use Python, install the trusted runtime/tool dependencies in every phase that needs them, including planning if applicable. Place helpers under the fingerprinted automation `scripts/` tree or explicitly extend fingerprinting to cover their location and dependency lock. Do not import candidate code to inspect metadata.

## Work package 4: Connect the adapter

Make small, explicit extensions to the existing seams:

- `src/identity.ts`: add the `python` language and preserve existing validation/ID formats. Expected target ID: `python--bot-cards`; expected state: `state/python/bot-cards.lock.json`.
- `src/types.ts` and `src/config.ts`: add Python runtime/package policy parsing. Replace the current non-.NET-means-Node assumption. Reject unsupported or incomplete Python profiles and retain safe-path/overlapping-destination checks.
- `src/languages.ts`: register a Python implementation of `LanguageValidation`.
- `src/sdk-policy.ts`: dispatch explicitly for all three languages, including asserting serialized selections. Unknown languages must fail rather than fall through to npm.
- `src/plan.ts`: map Python upstream discovery to `python`; currently every non-JS variant falls back to `dotnet`. Prefer one explicit language mapping over repeated binary conditions.
- `src/python-project.ts`: validate the supported layout, entry point, dependency declarations, selected SDK versions, and installed evidence. Reject obsolete application runtimes without banning legitimate API/model packages.
- `src/python-capabilities.ts`: extract `SourceCapabilities` for bot construction, message extension IDs, query/action/link routes, file consent, and meeting permissions. Parse Python syntax without executing sample modules; a trusted standard-library AST helper is suitable. Support the chosen import/decorator/alias patterns and diagnose unsupported dynamic registrations explicitly. Do not report missing features as success because analysis could not understand a route.
- `src/python-validation.ts`: implement project, restore/package verification, compile/import checks, protected contracts, and HTTP startup. Reuse shared manifest validation and required-check enforcement.
- `src/validation-process.ts`: use the validated Python environment interpreter and explicit startup arguments while preserving cancellation, timeout, output limits, cleanup, and sanitized credentials. Keep a single shared process lifecycle; extend startup selection rather than copying the runner.
- `src/validate.ts`, runtime interfaces, CLI readers, and serialization assertions: carry Python identity/selection through every path. Preserve compatible existing schema versions where possible; if a wire format changes, update producers, consumers, version guards, and fixtures together.

The `capabilities` interface is currently synchronous. If using a Python AST subprocess, keep it trusted, bounded, and compatible with that interface, or deliberately update all callers and tests. Do not leave an unawaited promise or an unbounded process behind an otherwise synchronous API.

Configure `profiles.python` in `config/targets.yml` with:

- `destinationRoot: samples/python/teams`.
- `canonicalSample: samples/python/quickstart`, subject to compatibility verification.
- `manifestAssets: samples/python/proactive/appManifest`, subject to asset verification.
- The new Python migration skill and existing `sync-teams-samples-to-agents-sdk` synchronization skill.
- `contractDirectory: automation/teams-sample-sync/tests/python-contracts`.
- Explicit Python package/runtime policy and generated-output exclusions such as nested `__pycache__`, `*.pyc`, environments, test caches, and coverage outputs.
- All seven verified source mappings and manifest metadata. Preserve sample-specific domains and placeholder conventions supported by the shared manifest validator.

Keep the production profile unregistered until it can run end to end. Use isolated fixture configurations for intermediate adapter tests. Once registered, scheduled `all` runs include Python automatically; do not accidentally activate a half-implemented language.

## Work package 5: Protected contracts and sample generation

Create `tests/python-contracts` with a shared harness and one discoverable suite per configured sample. Use real released Agents SDK routing and payload models, with deterministic replacements for connector/token transports, Graph, Wikipedia, file transfer, clocks, and timers. Unexpected external requests must fail. Test observable responses and side effects, not just method names or source strings. The attachment test must prove acknowledgement happens before a blocked upload completes. The targeted-message suite must test ownership and delayed delivery, not just immediate responses.

Contracts must live outside the generated sample root and remain unavailable for agent modification. Pin harness dependencies and make changes to the harness/helper/dependency lock invalidate prior validation. Disable ambient test plugins/configuration when running protected checks; use explicit test paths and trusted runner settings. Sample-owned tests may be supplementary, but cannot replace required protected contracts. A missing suite or zero collected tests fails validation.

Generate Python outputs through the synchronization process. PR 116 makes every configured generated destination synchronization-owned, including future language profiles. Ordinary maintenance can change the automation, skills, and external harness; bootstrap/import of generated Python samples must follow the migration and verified handoff path. Do not bypass this rule by manually editing output before profile registration or treating arbitrary issue assignment as synchronization authority.

Use cards as the first complete pipeline exercise, then AI messages/message extensions/task modules, followed by attachments/meetings/targeted messages. Keep all seven in the final scope. If live generation cannot run because of credentials, quota, or default-branch restrictions, complete offline tooling and report generated-output verification as blocked; fabricated agent output is not a completed migration.

## Work package 6: Workflow and CI

Preserve `.github/workflows/sync-teams-dotnet-samples.yml` as the filename to retain existing links/history; its display name is already generic. Add `python` to dispatch choices and setup the selected Python runtime where needed. Keep Node available for the coordinator. Continue using language-qualified matrix IDs/artifacts/concurrency groups.

Selection semantics must remain:

- `language=python, sample=all`: seven Python targets.
- `language=python, sample=bot-cards`: one Python target.
- `language=all, sample=bot-cards`: three language variants once fully registered.
- `language=all, sample=all`: all configured targets, currently expected to become 21.
- Invalid/unconfigured combinations fail; newly discovered upstream samples remain candidates rather than being silently enabled.

Extend `ci-teams-sample-sync.yml` path coverage to Python generated samples, canonical inputs, manifest assets, plugin/skill changes, trusted helper/lock files, and relevant workflow changes. Provision Python if offline automation tests invoke trusted Python helpers. Keep tests independent of paid Copilot sessions.

Extend `cd-samples.yml` to discover both immediate Python samples and `samples/python/teams/*` explicitly, avoiding recursive discovery of fixture/environment dependencies. Install each Teams sample in its own environment, verify dependency consistency, compile/import it, and run its protected contracts. Keep existing top-level Python, .NET, and Node coverage intact. Test the declared minimum and a supported current Python version; document any distinction between this CI matrix and the pinned synchronization runtime.

The synchronization workflow currently accepts schedule/dispatch only on the default branch and checks out that branch. A feature-branch dispatch is not an end-to-end trial. Do not remove this guard to make a demonstration pass. Validate locally/offline and through PR CI, then run an authorized default-branch validation after integration. Report this sequencing constraint clearly.

## Work package 7: Regression and acceptance checks

Add focused deterministic tests for:

- Python config/identity/source discovery, selection combinations, unsafe paths, and destination collisions.
- SDK version ordering/markers/runtime compatibility, incomplete selections, conflicts, malformed metadata, yanked/prerelease handling, and resolver/network failures.
- Declared/locked/installed dependency mismatches, untrusted index/path overrides, modified environments, and stale bytecode/output.
- AST capabilities with imports/aliases/decorators and invalid or unsupported registrations; manifest domain/command/permission mismatches.
- Python HTTP readiness, startup failure, missing interpreter, validation timeout, process cancellation, and credential sanitization.
- Required-check failures, partial validation, wrong identity, stale evidence, missing contracts, and zero collected tests.

Add offline Python candidate integration fixtures following the existing .NET/JS pattern. Fake Copilot and external package transports here, but keep actual filesystem, patch, state, fingerprint, and publication checks real. Cover initial import, fresh-checkout patch application, unchanged rerun, incremental source change, SDK-only change, skill/canonical/harness changes, state-only no-change output, one successful repair, persistent failure, outcome reconciliation, and removed upstream source. Do not substitute these fixtures for the real Python SDK contract run.

Add three-language publication/state regressions: colliding sample names remain isolated; Python never reads legacy .NET state; language/selection/output tampering fails; a missing or failed Python result blocks the consolidated bundle; successful mixed results preserve correct summaries/evidence; moved base and issue deduplication guarantees remain unchanged.

Run the existing checks on the correct implementation base, and capture exact commands and results:

```sh
npm ci --prefix automation/teams-sample-sync
npm run build --prefix automation/teams-sample-sync
npm test --prefix automation/teams-sample-sync
npx eslint automation/teams-sample-sync
npm run lint
dotnet test automation/teams-sample-sync/tests/contracts/TeamsSampleSync.ContractTests.csproj
git diff --check
```

Also build all seven JS Teams packages and execute their protected contracts, run Python dependency/compile/import/contract/smoke validation for all seven samples, and run the affected sample CI checks. Add documented executable commands for the new Python checks as part of implementation; do not leave placeholder commands in the delivered README. Existing reference results were 95 automation tests (one additional opt-in smoke test skipped), 35 JS contracts, and 19 .NET contracts, but test counts can change. Verify behavior and passing suites, not equality with those historical totals.

Keep live Copilot smoke tests opt-in. Offline success does not prove tenant behavior. For relevant samples document manual checks for Teams installation/authentication, manifest permissions, Graph access/subscriptions/transcripts, file consent/transfers, and targeted/proactive delivery. Report each as performed, failed, or pending; never infer credentialed success from mocked transports.

## Suggested implementation boundaries

These are reviewable change boundaries, not instructions to publish PRs automatically:

1. Python parity inventory, migration guidance, runtime/dependency decisions, and plugin metadata.
2. Python adapter, resolver, project/capability checks, protected harness, and fixture-only pipeline integration. Existing production profiles remain functional.
3. Complete protected behavior suites, runtime/CI integration, and profile activation when all configured targets are supported.
4. Verified initial Python sample imports through synchronization, grouped into interactions, attachments, meetings, and targeted messages if smaller reviews are useful.
5. Final mixed-language regression evidence, complete parity checklist, and operational documentation.

Adjust boundaries to keep every layer testable, but do not end the task after an adapter-only or pilot-only deliverable. Coordinate production activation and default-branch imports explicitly so scheduled runs never select unsupported targets. Existing stack review fixes should be inherited from the updated base rather than opportunistically reworked in the Python changes.

## Definition of done and worker handoff

Completion requires all seven configured Python samples with runnable assets/docs, the migration skill, frozen compatible dependencies, protected behavior tests, full deterministic validation, source/SDK incrementality, verified patches, and three-language workflow/CI coverage. The coordinator's existing guarantees must remain intact and existing .NET/JS suites must pass.

Deliver a final report with the implementation base SHA, changed modules, exact runtime/SDK/resolver choices, the completed behavior-to-test checklist, validation commands/results, generated migration and artifact provenance, remaining credentialed checks, and any unresolved SDK parity gaps. Link created PRs and explain stack dependencies if publication was authorized. Clearly distinguish completed implementation, verified generation, hosted CI, and live tenant validation.

Do not call the work fully complete if a configured sample is absent, a protected contract is missing/skipped, a dependency is unresolved, a publication gate is weakened, or a feature from the parity inventory has no implementation or explicit unresolved-gap report. No language should silently receive weaker synchronization or evidence guarantees.
