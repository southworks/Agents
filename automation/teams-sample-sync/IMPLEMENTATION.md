# JavaScript Teams synchronization: implementation record

Implemented on `southworks/update/teams-sync-js`, based on
`southworks/update/teams-sync-workflow` at `f503e4bf9f6bd383a25e5e3a016ce2cb9809b140`.
The original brief is [the implementation handoff](../../docs/teams-sample-sync-js-implementation-handoff.md).
All seven JavaScript/TypeScript samples are implemented and enabled. Python is deferred.

## Architecture and invariants

- One shared coordinator owns immutable planning, source/context evidence, write
  confinement, session protocol, cancellation, output digests, state and handoff.
- `LanguageValidation` has three operations: validate code, extract normalized
  source capabilities, and declare mandatory checks. Concrete .NET and JS
  adapters hide their project/build/contract rules. The common manifest checker
  consumes capability facts; it does not parse either source language.
- A small SDK-policy registry dispatches .NET release/NuGet resolution and JS npm
  resolution. Profile configuration supplies guidance, canonical sample,
  manifest asset source, contract directory, exclusions, runtime and package floor.
- Future Python work adds its concrete adapter/profile, resolver, guidance,
  contracts and workflow runtime setup. The coordinator is not duplicated.
- Configuration is v2, plan v4, context/state/validation v3 and result v5.
  Explicit `{ language, sample }` identities cross every boundary. Safe IDs use
  `language--sample`; report labels use `language/sample`.
- Verified state lives at `state/<language>/<sample>.lock.json`. Unqualified old
  .NET state supplies history only and forces revalidation. Namespaced state
  takes precedence; JS never consumes unqualified .NET state.
- Frozen input fingerprints bind source trees, exact package selections,
  profile guidance/contracts/assets, policy and validator implementation.
  Shared source changes conservatively reschedule both languages.
- Planning grants no edits. Code validation is unavailable in read-only phases
  because npm can mutate lockfiles. The trusted manifest-only check is read-only.
  Source/context/HEAD confinement is checked before and after validation.
- Publication remains all-or-nothing across the selected matrix, including mixed
  language runs. Verified no-change outcomes produce state-only patches.

## Package, build and CI policy

JS selection freezes stable compatible exact versions of activity, hosting,
Express hosting and MSTeams extensions within the floor's major. Dependency and
peer ranges and Node 24 engines are checked; versions need not have matching
patches. The live read-only registry check selected 1.9.1 for all four packages.
Samples declare those versions and have npm-generated v3 locks. Node 22 or newer
is documented; synchronization runs Node 24. .NET keeps its existing net10.0
and release-line policy.

Trusted JS validation prepares the lockfile and runs npm ci with scripts disabled,
public registry and empty explicit user/global npm configurations. It rejects
legacy app bootstraps, unsafe dependency sources/configuration and conflicting
installed SDK copies. Generated output/cache is deleted before forced compilation.
Protected tests run against fresh compiled output, followed by HTTP readiness and
released manifest schema/capability checks. Child processes are bounded,
cancellable and receive a sanitized environment. npm metadata does not receive
GitHub authentication.

Generated `node_modules/**`, `dist/**`, `coverage/**` and `*.tsbuildinfo` are
excluded from JS output digests. Subtree pruning happens before dependency-link
inspection; unexpected links in included source still fail. Lockfiles remain
included in the digest and patch. Candidate creation and independent patch
verification reject changed generated paths, including pre-existing tracked
generated files; exclusions cannot hide unvalidated publication bytes.

The generic sync workflow retains its filename to preserve references. Language
selection, artifacts, concurrency and reports use qualified identities; .NET setup
is conditional. Weekly/default-branch restrictions, credential separation,
publication ownership and Auto routing are preserved.
Normal sample CI now builds explicit immediate Node packages and `teams/*`
packages, then runs protected Teams contracts on Node 22/latest. No recursive
fixture/dependency discovery is used. This intentionally raises normal Node CI's
minimum from 20 to the SDK-supported 22. The workflow still targets PRs into
`main`; a stacked PR into the unmerged parent will need these checks run locally.

## Samples and behavior evidence

The seven Node sources were read at upstream commit
`b9aedfea98e3505acbcf68a3931be05a780d6149`. Scheduled synchronization still tracks
the configured upstream ref; this commit is provenance, not a permanent pin.
Each sample is an independent package with `createAgent` in `src/agent.ts`, a
separate HTTP entry point, environment template, README, manifest and icons.

| Sample | Preserved behavior | Protected contracts |
| --- | --- | ---: |
| agent-targeted-messages | Private confirmation/list/help, self/mention reminders, delayed proactive delivery, cancellation, dismiss/snooze, reaction commands/events, suggested actions and slash preview | 9 |
| bot-ai-messages | AI labels, sensitivity, citations and feedback invokes | 4 |
| bot-attachments | Download/upload bytes and headers, file consent accept/decline, one-time cleanup | 4 |
| bot-cards | Nested forms/actions, visibility and execute submission | 4 |
| bot-meetings | Start/end and participant events, Graph metadata/latest transcript, VTT parsing and bounded retries | 5 |
| bot-message-extensions | Wikipedia query command, unknown query fallback and link unfurling | 3 |
| bot-task-modules | Three launcher forms, real custom HTML page and chained submit behavior | 5 |

The SDK's installed declarations and source were inspected rather than inferring
JS APIs from .NET. Significant findings and fixes:

- Ordinary message routes need `new TeamsTurnContext(context)` for `.client`;
  a cast does not supply the getter. A routed default-transport test covers this.
- Nested SDK parsing drops Teams slash flags and reaction-user fields. A small
  HTTP normalizer preserves these as entities before parsing. Contracts use the
  same boundary and upstream-shaped reaction payloads.
- Captured conversation references are cloned before removing message-ID suffixes
  so immediate replies retain their original conversation. Delayed delivery uses
  saved reference/identity/adapter, not a revoked turn context.
- Targeted privacy uses the SDK activity treatment and explicit recipient.
- Meeting manifests include required Application RSC grants and webApplicationInfo;
  the source inspector and manifest checker reject missing grants. Setup explains
  Teams-managed bot registration and participant subscriptions.
- Graph transcript retrieval preserves the beta base URL without double-version
  paths. A real Graph client with fake transport tests the default path.
- File consent handles attachment-only messages and awaited uploads. Generic
  fallback routes do not preempt more specific Teams routes.
- TypeScript 7 no longer exposes the prior JS compiler API. An explicit runtime
  alias to TypeScript 6.0.3 supplies AST inspection; builds use TypeScript 7.0.2.
- Reminder delays reject zero/overflow instead of allowing Node timers to fire
  immediately. This small behavior correction is documented in the sample.

The public JS migration skill and internal language-neutral sync skill are updated.
The JS plugin and marketplace versions are both 1.3.0.

## Validation performed

- Automation suite: **82 passed, one opt-in live Copilot test skipped** (83 total).
  TypeScript compilation and focused repository ESLint pass.
- All 34 protected JS contracts pass through real SDK routes/default transports
  where applicable; external services are substituted without tenant credentials.
- All seven samples pass the full real validator: npm lock preparation/install,
  project/package checks, forced build, contracts, HTTP startup and released manifest
  schema. Repeat validation preserves output digests.
- All eight existing .NET protected contracts pass on .NET SDK 10.0.403 after extraction.
- Both skill frontmatter validators and Git diff whitespace checks pass.
- Offline candidate integration uses fake Copilot/npm transports while executing
  real planning/session/coordinator/state/patch gates. A prepared patch is applied
  to a fresh clone and independently verified. Tests never mutate real repo state.
- Focused read-only reviews covered validator extraction, language contracts,
  JS validation, sample parity and final integration; identified defects were fixed
  with regression tests. The final publication review found generated paths could
  enter a patch outside its digest; both boundaries now reject them.

| Acceptance area | Evidence |
| --- | --- |
| Empty destination / initial import | Offline candidate creates complete package, trusted lock, assets, namespaced state and verified patch |
| Existing destination without state | Initial reconciliation preserves destination-only guidance and can produce state-only patch |
| Unchanged / incremental / output drift | Namespaced planning tests; second unchanged plan empty; changed JS source/policy affects only its variant |
| Same names / legacy state | Separate state/artifacts, mixed selection/publication and .NET-only legacy-history tests |
| SDK/package/manifest failures | Stable resolver/backtracking, malformed evidence, conflicting locks/imports/hooks, route/capability mismatch and required-contract tests |
| Outcome/deadline | Existing session reconciliation/repair and child-process cancellation tests retained |
| Containment/network failures | Offline candidates reject source/context/outside writes and npm infrastructure errors with no state or patch |
| Handoff safety | Mixed-run missing/failed/mismatched results block publication; tampered output/state and relabeled artifacts fail verification |
| Base movement / publish disabled | Workflow tests preserve rejection and publication conditions; no external issue is created locally |
| Nested samples | Explicit-depth CI configuration test and real builds/contracts for all seven |

Live Copilot usage, credentialed Teams/Entra/Graph behavior and hosted Actions runs
were not performed. Manual rollout should start with non-publishing cards, then
message extensions, then all seven after the branch reaches the default branch.
Meeting permissions/subscriptions, Graph admin consent/application access policy,
file uploads, custom forms and private group delivery require tenant verification.
Samples use in-memory state; reminders are not durable/distributed scheduling.

The implementation worker performed no staging, commits, pushes, issues,
assignments or PRs. Existing staging by the user is left intact; follow-up fixes
remain unstaged. Git commits in isolated temporary fixtures are test setup only. The
handoff document remains a pre-existing design artifact.

## Follow-up review corrections

The shared manifest checker now compares link-handler domains with exact
`expectedLinkDomains` from protected target configuration. Both Wikipedia sample
variants require `en.wikipedia.org`; missing policy, unrelated/extra domains and
wildcards fail. The policy is part of the target input fingerprint. An upstream
domain change requires a reviewed target policy change, outside the migrating
agent's write scope.

JS capability inspection uses lexical symbols to resolve const helper aliases
and chained calls. Detached/destructured/computed registrations, mutable aliases
and unresolved receivers produce explicit inspection errors rather than silently
omitting manifest requirements. Symbol lookup excludes dependency and ambient
type loading. Regression tests cover the reported alias and unsupported forms.

`SyncError` now lives in dependency-neutral `src/errors.ts`; configuration
re-exports it for existing callers, and identity imports it directly. This removes
the runtime config/identity cycle. Targeted reminder control flow uses multiline
blocks throughout the sample's source modules.

The follow-up checks passed: 82 automation tests (one live test skipped),
automation and targeted-sample builds, focused ESLint, both real released-schema
message-extension manifest checks, and the targeted/message-extension contracts.

## Automation readability pass

Reviewed the complete synchronization directory and its workflow integration,
including sources, tests, C# contracts, build/configuration files, prompts and
skills. Already readable guidance and C# contracts were retained. Generated
lockfiles, dependency trees and build output were excluded from style edits.

- Added scoped lint rules for braced control flow, object properties, type
  member formatting and return spacing; retained repository conventions.
- Replaced the nested JS capability closure with a per-file SourceInspector
  whose phases name imports, declarations, callback aliases and route checks.
- Separated manifest capability consistency from JSON/assets/schema validation.
- Made JS project policy conditions and compatible-version selection explicit;
  simplified recursive XML lookup and named validation recording operations.
- Grouped migration outcome and manifest tests by behavior; shared migration
  session doubles live in a fixture module rather than crowding test cases.
- Expanded workflow shell branches and wrapped CLI arguments without changing
  publication restrictions, issue ownership or credentials.
- Replaced the inline build command with an explicit build script, included in
  validator fingerprints so future build changes force revalidation.
- Documented module responsibilities in the automation README. No new language
  support, public API changes or migration behavior changes were introduced.

Independent read-only review found no actionable regressions. TypeScript build,
82 automation tests (one live test skipped), all 34 JS contracts, all eight .NET
contracts and scoped ESLint passed. Hosted Actions and live Copilot/tenant checks
were not run. Existing staging was preserved; these readability edits are unstaged.

## Second readability pass

The second pass separates distinct control-flow steps with blank lines and
retains these rules in scoped source lint configuration. Reports now build
optional sections with explicit branches, with names that identify Markdown
escaping, inline code and validation lines. Candidate discovery uses a clear
loop with a named language variant instead of nested filtering and mapping.

Manifest capability checks now live in `src/manifest-capabilities.ts`, separate
from JSON parsing, assets, README claims and released-schema validation. This
keeps each module below the file-size ceiling without compressing its code.
The refactor preserves report text, discovery results and validation behavior.

## Hand-written code file sizes

Physical lines include imports, comments and blank lines. Every new or modified
hand-written code/config file is at most 500 lines. Lockfiles, binary icons,
third-party files and Markdown prose are excluded. The complete table below
records current sizes after the readability refactor. Unrelated oversized files
were not changed. Paths below are relative to the repository root.

| File | Lines |
| --- | ---: |
| `.claude-plugin/marketplace.json` | 33 |
| `.github/workflows/cd-samples.yml` | 143 |
| `.github/workflows/sync-teams-dotnet-samples.yml` | 310 |
| `agent-plugins/agents-for-js/plugin.json` | 11 |
| `automation/teams-sample-sync/config/targets.yml` | 163 |
| `automation/teams-sample-sync/package.json` | 33 |
| `automation/teams-sample-sync/scripts/build.mjs` | 24 |
| `automation/teams-sample-sync/src/agent-runner.ts` | 317 |
| `automation/teams-sample-sync/src/agent-tools.ts` | 77 |
| `automation/teams-sample-sync/src/candidate.ts` | 261 |
| `automation/teams-sample-sync/src/cli-io.ts` | 87 |
| `automation/teams-sample-sync/src/cli.ts` | 114 |
| `automation/teams-sample-sync/src/config.ts` | 319 |
| `automation/teams-sample-sync/src/context.ts` | 189 |
| `automation/teams-sample-sync/src/dotnet-capabilities.ts` | 23 |
| `automation/teams-sample-sync/src/dotnet-project.ts` | 267 |
| `automation/teams-sample-sync/src/dotnet-validation.ts` | 157 |
| `automation/teams-sample-sync/src/errors.ts` | 7 |
| `automation/teams-sample-sync/src/git.ts` | 236 |
| `automation/teams-sample-sync/src/guard.ts` | 71 |
| `automation/teams-sample-sync/src/handoff-bundle.ts` | 42 |
| `automation/teams-sample-sync/src/identity.ts` | 47 |
| `automation/teams-sample-sync/src/js-capabilities.ts` | 272 |
| `automation/teams-sample-sync/src/js-project.ts` | 159 |
| `automation/teams-sample-sync/src/js-validation.ts` | 148 |
| `automation/teams-sample-sync/src/js-versions.ts` | 184 |
| `automation/teams-sample-sync/src/language-validation.ts` | 37 |
| `automation/teams-sample-sync/src/languages.ts` | 14 |
| `automation/teams-sample-sync/src/manifest-capabilities.ts` | 153 |
| `automation/teams-sample-sync/src/manifest.ts` | 349 |
| `automation/teams-sample-sync/src/plan-inputs.ts` | 77 |
| `automation/teams-sample-sync/src/plan.ts` | 141 |
| `automation/teams-sample-sync/src/publish-bundle.ts` | 65 |
| `automation/teams-sample-sync/src/report.ts` | 151 |
| `automation/teams-sample-sync/src/sdk-policy.ts` | 15 |
| `automation/teams-sample-sync/src/source-files.ts` | 33 |
| `automation/teams-sample-sync/src/state.ts` | 148 |
| `automation/teams-sample-sync/src/sync-session.ts` | 391 |
| `automation/teams-sample-sync/src/types.ts` | 202 |
| `automation/teams-sample-sync/src/validate.ts` | 156 |
| `automation/teams-sample-sync/src/validation-process.ts` | 242 |
| `automation/teams-sample-sync/src/verify-patch.ts` | 151 |
| `automation/teams-sample-sync/src/versions.ts` | 223 |
| `automation/teams-sample-sync/tests/fixtures/js-candidate.ts` | 163 |
| `automation/teams-sample-sync/tests/fixtures/migration-session.ts` | 74 |
| `automation/teams-sample-sync/tests/integration/candidate-failures.test.ts` | 102 |
| `automation/teams-sample-sync/tests/integration/js-candidate.test.ts` | 168 |
| `automation/teams-sample-sync/tests/integration/sdk-smoke.test.ts` | 69 |
| `automation/teams-sample-sync/tests/js-contracts/agent-targeted-messages.test.mjs` | 314 |
| `automation/teams-sample-sync/tests/js-contracts/bot-ai-messages.test.mjs` | 49 |
| `automation/teams-sample-sync/tests/js-contracts/bot-attachments.test.mjs` | 142 |
| `automation/teams-sample-sync/tests/js-contracts/bot-cards.test.mjs` | 53 |
| `automation/teams-sample-sync/tests/js-contracts/bot-meetings.test.mjs` | 161 |
| `automation/teams-sample-sync/tests/js-contracts/bot-message-extensions.test.mjs` | 76 |
| `automation/teams-sample-sync/tests/js-contracts/bot-task-modules.test.mjs` | 92 |
| `automation/teams-sample-sync/tests/js-contracts/harness.mjs` | 152 |
| `automation/teams-sample-sync/tests/unit/agent-runner.test.ts` | 167 |
| `automation/teams-sample-sync/tests/unit/generated-files.test.ts` | 68 |
| `automation/teams-sample-sync/tests/unit/handoff-bundle.test.ts` | 69 |
| `automation/teams-sample-sync/tests/unit/js-capabilities.test.ts` | 107 |
| `automation/teams-sample-sync/tests/unit/js-validation.test.ts` | 165 |
| `automation/teams-sample-sync/tests/unit/js-versions.test.ts` | 117 |
| `automation/teams-sample-sync/tests/unit/language-validation.test.ts` | 102 |
| `automation/teams-sample-sync/tests/unit/link-domains.test.ts` | 54 |
| `automation/teams-sample-sync/tests/unit/manifest-validation.test.ts` | 287 |
| `automation/teams-sample-sync/tests/unit/migration-outcomes.test.ts` | 136 |
| `automation/teams-sample-sync/tests/unit/migration-session.test.ts` | 371 |
| `automation/teams-sample-sync/tests/unit/planning-state.test.ts` | 213 |
| `automation/teams-sample-sync/tests/unit/profile-config.test.ts` | 92 |
| `automation/teams-sample-sync/tests/unit/publish-bundle.test.ts` | 235 |
| `automation/teams-sample-sync/tests/unit/report.test.ts` | 142 |
| `automation/teams-sample-sync/tests/unit/sample-ci.test.ts` | 20 |
| `automation/teams-sample-sync/tests/unit/state-identity.test.ts` | 96 |
| `automation/teams-sample-sync/tests/unit/validation-cancellation.test.ts` | 53 |
| `automation/teams-sample-sync/tests/unit/validation-path.test.ts` | 206 |
| `automation/teams-sample-sync/tests/unit/validation-permission.test.ts` | 10 |
| `automation/teams-sample-sync/tests/unit/version-policy.test.ts` | 226 |
| `automation/teams-sample-sync/tests/unit/workflow-config.test.ts` | 190 |
| `eslint.config.js` | 33 |
| `samples/nodejs/teams/agent-targeted-messages/env.TEMPLATE` | 9 |
| `samples/nodejs/teams/agent-targeted-messages/manifest/manifest.json` | 63 |
| `samples/nodejs/teams/agent-targeted-messages/package.json` | 25 |
| `samples/nodejs/teams/agent-targeted-messages/src/agent.ts` | 131 |
| `samples/nodejs/teams/agent-targeted-messages/src/commands.ts` | 92 |
| `samples/nodejs/teams/agent-targeted-messages/src/index.ts` | 16 |
| `samples/nodejs/teams/agent-targeted-messages/src/messages.ts` | 120 |
| `samples/nodejs/teams/agent-targeted-messages/src/reactions.ts` | 45 |
| `samples/nodejs/teams/agent-targeted-messages/src/reminders.ts` | 118 |
| `samples/nodejs/teams/agent-targeted-messages/tsconfig.json` | 15 |
| `samples/nodejs/teams/bot-ai-messages/env.TEMPLATE` | 9 |
| `samples/nodejs/teams/bot-ai-messages/manifest/manifest.json` | 38 |
| `samples/nodejs/teams/bot-ai-messages/package.json` | 25 |
| `samples/nodejs/teams/bot-ai-messages/src/agent.ts` | 84 |
| `samples/nodejs/teams/bot-ai-messages/src/index.ts` | 10 |
| `samples/nodejs/teams/bot-ai-messages/tsconfig.json` | 15 |
| `samples/nodejs/teams/bot-attachments/env.TEMPLATE` | 9 |
| `samples/nodejs/teams/bot-attachments/manifest/manifest.json` | 37 |
| `samples/nodejs/teams/bot-attachments/package.json` | 25 |
| `samples/nodejs/teams/bot-attachments/src/agent.ts` | 86 |
| `samples/nodejs/teams/bot-attachments/src/files.ts` | 25 |
| `samples/nodejs/teams/bot-attachments/src/index.ts` | 10 |
| `samples/nodejs/teams/bot-attachments/tsconfig.json` | 15 |
| `samples/nodejs/teams/bot-cards/env.TEMPLATE` | 9 |
| `samples/nodejs/teams/bot-cards/manifest/manifest.json` | 39 |
| `samples/nodejs/teams/bot-cards/package.json` | 25 |
| `samples/nodejs/teams/bot-cards/src/agent.ts` | 70 |
| `samples/nodejs/teams/bot-cards/src/index.ts` | 10 |
| `samples/nodejs/teams/bot-cards/tsconfig.json` | 15 |
| `samples/nodejs/teams/bot-meetings/env.TEMPLATE` | 9 |
| `samples/nodejs/teams/bot-meetings/manifest/manifest.json` | 52 |
| `samples/nodejs/teams/bot-meetings/package.json` | 26 |
| `samples/nodejs/teams/bot-meetings/src/agent.ts` | 108 |
| `samples/nodejs/teams/bot-meetings/src/index.ts` | 10 |
| `samples/nodejs/teams/bot-meetings/src/transcripts.ts` | 37 |
| `samples/nodejs/teams/bot-meetings/tsconfig.json` | 15 |
| `samples/nodejs/teams/bot-message-extensions/env.TEMPLATE` | 9 |
| `samples/nodejs/teams/bot-message-extensions/manifest/manifest.json` | 76 |
| `samples/nodejs/teams/bot-message-extensions/package.json` | 25 |
| `samples/nodejs/teams/bot-message-extensions/src/agent.ts` | 83 |
| `samples/nodejs/teams/bot-message-extensions/src/index.ts` | 10 |
| `samples/nodejs/teams/bot-message-extensions/src/search.ts` | 29 |
| `samples/nodejs/teams/bot-message-extensions/tsconfig.json` | 15 |
| `samples/nodejs/teams/bot-task-modules/env.TEMPLATE` | 12 |
| `samples/nodejs/teams/bot-task-modules/manifest/manifest.json` | 37 |
| `samples/nodejs/teams/bot-task-modules/package.json` | 25 |
| `samples/nodejs/teams/bot-task-modules/pages/CustomForm/index.html` | 43 |
| `samples/nodejs/teams/bot-task-modules/src/agent.ts` | 73 |
| `samples/nodejs/teams/bot-task-modules/src/cards.ts` | 36 |
| `samples/nodejs/teams/bot-task-modules/src/index.ts` | 14 |
| `samples/nodejs/teams/bot-task-modules/tsconfig.json` | 15 |
