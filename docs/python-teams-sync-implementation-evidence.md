# Python Teams synchronization implementation evidence

This records the Python workflow and tooling implementation. The user clarified that this
phase adds Python support; running migrations and further testing are deferred. No GitHub
token is needed to deliver these code changes. Earlier check results below are retained as
evidence, not as a claim that the seven Python samples have been migrated.

## Implementation base

- Planning checkout: `8171bc7e0ca3b8defd578a6bb317367c2901983f`.
- PR 116 remained open when inspected, with no review or issue comments returned by GitHub.
- Required stack tip: `7e367ce66552feb9c934a492615a841b40915a3f`.
- Local integration commit: `6b32ad7faaa49cdd573618397c1a5a1fb345d2d3`.
- The merge preserves newer planning-branch history and the implementation plan.
- Language profiles, independent validation, and generated-sample ownership are present.

## Pinned upstream input

Repository: `OfficeDev/Microsoft-Teams-Samples`.
Commit: `b9aedfea98e3505acbcf68a3931be05a780d6149`.
Root: `samples/TeamsSDK`.

GitHub's contents API confirmed each directory below at that exact commit. Each contains
`main.py`, `pyproject.toml`, `README.md`, `.env.TEMPLATE`, and `assets`.

| Family | Source beneath root | Additional observed input | Migration/contracts |
| --- | --- | --- | --- |
| agent-targeted-messages | agent-targeted-messages/python/agent-targeted-messages | uv.lock | Pending |
| bot-ai-messages | bot-ai-messages/python/bot-ai-messages | — | Pending |
| bot-attachments | bot-attachments/python/bot-attachments | — | Pending |
| bot-cards | bot-cards/python/bot-cards | — | Pending |
| bot-meetings | bot-meetings/python/bot-meetings | — | Pending |
| bot-message-extensions | bot-message-extensions/python/bot-message-extensions | — | Pending |
| bot-task-modules | bot-task-modules/python/bot-task-modules | pages | Pending |

Directory existence does not establish behavioral parity. Inspection of handlers, manifests,
and both existing contract suites remains required before completing the feature checklist.

## Dependency observations

Authoritative PyPI JSON metadata was queried for each package on 2026-11-03.
These observations are inputs to resolver design, not a frozen migration selection.

| Package | Observed latest stable version | Requires-Python |
| --- | --- | --- |
| microsoft-agents-activity | 1.9.0 | >=3.10 |
| microsoft-agents-hosting-core | 1.9.0 | >=3.10 |
| microsoft-agents-hosting-aiohttp | 1.9.0 | >=3.10 |
| microsoft-agents-authentication-msal | 1.9.0 | >=3.10 |
| microsoft-agents-hosting-msteams | 1.9.0 | >=3.11 |

The Teams extension requires `microsoft-teams-api==2.1.0` and `msgraph-sdk>=1.58.0`.
The Teams API dependency is legitimate and must not be rejected as an obsolete hosting runtime.
The extension, aiohttp host, and MSAL package require hosting-core exactly 1.9.0;
hosting-core requires activity exactly 1.9.0.

Python 3.10 cannot validate this extension release. A synchronization runtime of Python 3.11
is the proposed minimum, subject to complete wheel resolution. The resolver/tool version,
hash-locked tool dependencies and wheel-only resolution are implemented. Released SDK API
inspection and real dispatch smoke checks pass; sample-specific execution remains pending.
The SDK repository main commit observed was `4c7d1c339e17e99c850eee355afcf5d5856fd1da`;
main documentation alone does not prove the released 1.9.0 API.

## Canonical hosting observations

`samples/python/quickstart/src/start_server.py` registers authenticated `POST /api/messages`
but no `GET /` readiness route. Generated samples need a local readiness route for the
existing smoke contract. `src/main.py` starts the server at module import; generated
application construction must instead remain importable without binding a port.
Canonical maintenance, if needed, must be explicit; migration cannot edit a sibling sample.

## Remaining acceptance evidence

The Python migration skill and seven-family behavior reference are present under
`agent-plugins/agents-for-python/skills/teams-sdk-to-agents-sdk-python-migration`.
Plugin and marketplace versions are 1.3.0. Trusted project inspection, registry-only
requirements validation, resolver-report hash locking, installed metadata verification,
and fresh-environment preparation are implemented and registered as an adapter.
The helper suite passes on Python 3.11.14. Two TypeScript environment tests verify
failure cleanup and rejection of mismatched interpreter evidence.

`ci-teams-sample-sync.yml` now provisions Python 3.11.14, installs the hash-pinned
trusted tools, and runs all helper tests. Its path filter includes Python generated
destinations, quickstart hosting inputs, and proactive manifest assets. Hosted execution
has not been performed.

A real `packaging==26.2` preparation trial resolved, hash-locked, installed into a fresh
environment and passed installed metadata and pip consistency checks. Initial DNS failure
was traced to case-sensitive filtering of Windows SYSTEMROOT and fixed with a regression
test. Full SDK 1.9.0 wheel resolution succeeded, but installation failed on generated
msgraph-sdk filenames exceeding this Windows machine's path limit, both beneath the
checkout and in a short C-drive validation directory. This is not evidence of a successful
SDK environment or contract run. A subsequent extended-length-path trial successfully
installed and verified all dependencies on both Python 3.12.0 and 3.11.14. Real SDK message
and query dispatch smoke checks pass on 3.11.14. Linux wheel installation, dependency
consistency, SDK message/query dispatch and environment fingerprinting also pass under
Ubuntu WSL with CPython 3.11.14.

The TypeScript bridge in `src/python-versions.ts` now invokes the isolated policy helper,
asserts serialized selection identity, and retrieves release-specific PyPI metadata with
deadlines, request limits, redirect rejection, and a streamed response size limit.
Three transport tests cover HTTP failure, oversized responses, and missing interpreters.
The bridge is registered, with all seven Python targets and protected suite files present.
The seven suites have not yet executed against generated candidates.

Validation on this working tree:

- `npm ci --prefix automation/teams-sample-sync`: passed (three dependency audit findings).
- `npm ci`: passed (13 dependency audit findings in the existing root lockfile).
- `npm run build --prefix automation/teams-sample-sync`: passed.
- `npm test --prefix automation/teams-sample-sync`: 108 passed, zero failed, one opt-in smoke skipped.
- `npm run lint`: passed after excluding generated `.sync` environments from lint discovery.
- `dotnet test automation/teams-sample-sync/tests/contracts/TeamsSampleSync.ContractTests.csproj`: 19 passed.
- ESLint for `src/python-versions.ts` and `tests/unit/python-versions.test.ts`: passed.
- `git diff --check`: passed.

The published `microsoft-agents-hosting-msteams==1.9.0` wheel was downloaded without
dependencies or execution for API inspection. It exports `microsoft_agents.hosting.msteams`,
including `TeamsAgentExtension`, `message_extensions.query`, `task_modules.fetch`, and
`meetings.start`. The extension attaches a before-turn hook and wraps typed invoke payloads;
protected tests must exercise these routes rather than invoking application handlers directly.

Trusted helper implementation now includes non-executing AST inventories and SDK metadata
selection using `packaging==26.2`. Its tool requirement is pinned to the PyPI wheel SHA-256;
an isolated, wheel-only `pip download --require-hashes` verified the artifact successfully.
The SDK selection identity hashes every required package/version pair. Markers target Linux
x86_64 CPython, and runtime input requires an exact patch version. Full transitive wheel
resolution and installed consistency checks pass on Python 3.11.14. The real metadata
resolver selected SDK 1.9.0 for all five distributions, with selection identity
`pypi:03ba6a68119c7b9232642474a7018b555cfca042848645bb1dfd98c25a0f482a`.

The Python profile is registered, bringing the total to 21 targets. A real initial plan against
the pinned upstream commit selects all seven Python targets. No generated Python destination
has been manually edited. Offline pipeline fixtures verify initial import, fresh-clone patch
application, unchanged reruns, state-only patches, source/SDK/guidance changes, upstream removal,
bounded repair, failure blocking and selection/identity tampering.

Verified generation is deferred to the execution phase. The workflow's existing authentication
requirements apply when that phase is run, not when adding Python support. No Copilot session
or workflow was launched for generation. All seven
generated imports, sample-level Python suite execution, hosted CI and credentialed tenant
checks remain pending. All seven JavaScript packages built successfully and their 35
protected contracts passed. All 19 .NET contracts passed. These checks do not substitute
for the pending Python generated-sample runs.

## Review and final offline checks

An independent read-only review identified committed-lock fidelity, CI environment integrity,
and HTTP descendant-process cleanup issues. The implementation now installs and verifies the
committed lock on Python 3.11.14, compares full environment fingerprints after CI candidate
execution, and terminates HTTP process trees. Regression tests cover declared non-SDK lock
constraints, extras, modified environments and listening worker cleanup. A real PyPI trial
installed a valid committed hash lock and rejected a corrupted hash.

All 55 trusted Python helper tests pass on Python 3.11.14. The real all-language planner
produced 21 targets, seven per language, against the pinned upstream commit. Its selections
were .NET `1.9.*` (`v1.9.205`), JS `1.10.1`, and Python `1.9.0`. Existing sample contracts
test the checked-in reference samples; they do not claim verified migration to those new
planner selections.

The existing execution authentication gate remains unchanged. No generated Python source,
verified Python sample patch, hosted CI run, handoff issue,
or tenant validation is claimed. The default-branch workflow restriction is unchanged.

The latest full automation run passed 108 tests with zero failures and one opt-in live smoke
skip. Subsequent asynchronous fingerprint integration tests passed. Full SDK environment
fingerprinting took approximately 177 seconds on this Windows checkout and now runs through
the shared bounded, cancellable validation process path. Windows HTTP processes start suspended,
join a kill-on-close job, and resume only after ownership is established; cleanup waits for all
job members, including workers whose parent exited.
Linux HTTP checks retain the coordinator process group for deadline cancellation and use
subreaper ownership for normal descendant cleanup. All 55 helpers pass under Ubuntu WSL
on CPython 3.11.14. The real SDK environment fingerprints in approximately 7.3 seconds on
Linux. Its standard internal lib64-to-lib symlink is explicitly supported. Hosted CI is
still pending. All four real planner combinations produced the required
counts: Python/all = 7, Python/cards = 1, all/cards = 3, all/all = 21. Invalid selection failed.

## Phase boundary

Workflow and tooling changes are implemented for all seven Python targets. Per the clarified
scope, generation and further execution are deferred. All seven generated destinations are
still absent. Their protected
suites are authored but have not executed against migrated candidates. No behavior-to-implementation
row in the parity inventory can be marked complete yet. Hosted CI and live Teams/Graph/file-transfer
checks belong to the later execution phase. Run generation through the existing synchronization
lifecycle when requested; do not manually fabricate sample output or state.
