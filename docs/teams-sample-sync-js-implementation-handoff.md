# JavaScript Teams sample synchronization: implementation handoff

## Purpose and status

Implement JavaScript/TypeScript support in the existing automation that migrates selected Teams SDK samples into Microsoft 365 Agents SDK samples. Refactor the automation enough that Python can be added in a separate, later PR through the same language extension points.

This document is the implementation brief for a worker who is new to this repository. It records the design agreed during analysis; it does not claim that the implementation exists or that validation has passed.

At handoff creation:

- Repository: `C:\repos\southworks\Agents`.
- Working branch: `southworks/update/teams-sync-js`.
- Parent branch for the eventual stacked PR: `southworks/update/teams-sync-workflow`.
- Branch creation commit: `f503e4bf9f6bd383a25e5e3a016ce2cb9809b140`.
- No implementation changes, builds, tests, live migrations, pushes, or PR creation were performed during the design work.
- This document is the only intentional file change made for the handoff.
- The user requested a detailed handoff, readable code, and relatively small code files with a maximum of 500 lines.

Recheck the branch and working tree before starting: the parent branch, base commit, and repository contents can change after this document is written. Preserve unrelated user changes.

## Repository instructions and authorization

The user supplied these repository instructions:

1. Treat user questions as read-only.
2. When writing code, format it properly; do not put code into a single-line format.
3. Do not stage Git changes unless the user specifically requests staging.
4. See `CLAUDE.md`.

No `CLAUDE.md` was found in the repository or its parent directories during analysis. Search again when starting; follow any applicable instructions that now exist. Also check for applicable `AGENTS.md` files.

The original task authorized branch creation and analysis only. Creating this handoff does not itself authorize a worker to start implementing or publishing. When assigned implementation, work within that assignment. Do not interpret this document as permission to stage, commit, push, create issues, assign Copilot, open a PR, run a live migration, or consume paid Copilot usage without corresponding authorization.

Do not spawn additional workers unless the assignment or applicable instructions authorize delegation. Never place credentials in this document, code, fixtures, or logs.

## Desired outcome and scope

The completed change should provide:

- One shared synchronization engine with concrete .NET and JS/TS language adapters.
- Initial creation and subsequent synchronization of seven JS/TS Teams samples.
- Language-aware configuration, planning, validation, state, artifacts, reporting, and patch verification.
- A dedicated public Teams SDK to Agents SDK TypeScript migration skill.
- Preserved .NET migration behavior and protection guarantees.
- Normal repository PR checks that actually build the new nested Node samples.
- A clear path to a Python adapter in a later PR without duplicating the coordinator.

The automation is already written in TypeScript. Adding JS support means supporting the language of the migrated samples; it does not mean rewriting the automation.

Use `js` as the proposed automation profile identifier, describe the implementation as JavaScript/TypeScript in user-facing documentation, and place samples under the repository's established `nodejs` directory. Upstream Node examples inspected during analysis use TypeScript.

Out of scope:

- Implementing Python support or enabling Python targets now.
- Supporting arbitrary downloaded language plugins or configuration-supplied shell programs.
- Migrating every Teams sample in the upstream repository.
- Replacing the persistent Copilot implementation session or adding a reviewer-agent pipeline.
- Changing Copilot Auto model routing, publication ownership, or PR readiness policy.
- Broad cleanup of unrelated samples, deployment systems, or SDK skills.
- Treating local automated checks as proof of live Teams, Graph, Entra, or Azure behavior.

## Read these files first

All paths below are relative to the repository root. Read the actual implementation rather than relying only on this description.

| Path | Responsibility / reason to read |
| --- | --- |
| `automation/teams-sample-sync/README.md` | Current workflow, permissions, recovery and local commands |
| `.github/workflows/sync-teams-dotnet-samples.yml` | Planning, matrix migration, artifact verification, coordinated handoff |
| `automation/teams-sample-sync/config/targets.yml` | Seven .NET targets, upstream, skills, runtime and package policy |
| `automation/teams-sample-sync/config/ownership.yml` | Protected paths and output exclusions |
| `automation/teams-sample-sync/src/types.ts` | Serialized configuration, plan, state, context and result contracts |
| `automation/teams-sample-sync/src/config.ts` | Configuration parsing, validation and path containment |
| `automation/teams-sample-sync/src/plan.ts` | Input digests, drift detection and migration matrix |
| `automation/teams-sample-sync/src/versions.ts` | Current .NET release and NuGet resolution |
| `automation/teams-sample-sync/src/context.ts` | Pinned source context, prior snapshot, change evidence |
| `automation/teams-sample-sync/src/state.ts` | Verified state and prior-history compatibility |
| `automation/teams-sample-sync/src/cli.ts` | Command orchestration, candidate generation and patch verification |
| `automation/teams-sample-sync/src/agent-runner.ts` | Copilot setup, permissions, tool selection and transcript |
| `automation/teams-sample-sync/src/sync-session.ts` | Frozen plan, implementation, repair and outcome reconciliation |
| `automation/teams-sample-sync/src/agent-tools.ts` | Trusted validation tool and before/after guards |
| `automation/teams-sample-sync/src/guard.ts` | Source, context, HEAD and selected-sample confinement |
| `automation/teams-sample-sync/src/git.ts` | Tree materialization, changed paths and deterministic digests |
| `automation/teams-sample-sync/src/validate.ts` | Project, package, manifest, runtime and contract validation |
| `automation/teams-sample-sync/src/publish-bundle.ts` | Complete coordinated result set |
| `automation/teams-sample-sync/src/handoff-bundle.ts` | Patch and evidence packaging |
| `automation/teams-sample-sync/src/report.ts` | Summaries, issue descriptions and handoff identity |
| `automation/teams-sample-sync/prompts/agent-prompt.md` | Current .NET-oriented implementation instructions |
| `automation/teams-sample-sync/skills/sync-teams-dotnet-samples-to-agents-sdk/` | Internal synchronization skill |
| `automation/teams-sample-sync/tests/unit/` | Existing behavior and workflow tests |
| `automation/teams-sample-sync/tests/contracts/` | Protected .NET behavior contracts |
| `automation/teams-sample-sync/tests/integration/sdk-smoke.test.ts` | Opt-in live Copilot test |
| `agent-plugins/agents-for-net/skills/teams-sdk-to-agents-sdk-dotnet-migration/` | Existing Teams migration guidance |
| `agent-plugins/agents-sdk-common/skills/teams-app-manifest/` | Shared manifest guidance |
| `agent-plugins/agents-for-js/` | Existing JS plugin and skills |
| `samples/nodejs/quickstart/` | Local Node conventions; not a complete CI template |
| `.github/workflows/cd-samples.yml` | Existing repository sample CI |

## Current behavior to preserve

The workflow runs weekly on Sunday at 00:00 UTC and supports manual dispatch. It is restricted to the repository's default branch. A manual run selects one sample or all and controls whether publication is enabled.

Planning fetches upstream metadata into a bare repository without checking out source code. It resolves an Agents SDK version selection and compares source trees, policy inputs, skills, canonical sample, validator inputs and current output against verified state. Pending samples become independent matrix jobs. New upstream candidates are reported, not automatically imported. Removed configured sources block publication.

Each migration uses the exact upstream commit from the plan and the pinned destination base. One persistent Copilot session first produces a read-only migration plan. The coordinator freezes and hashes it before enabling selected-sample writes. The same session implements, validates and self-audits its work.

The coordinator independently runs full validation. It permits one repair turn for deterministic validation failures, with separate existing continuation/format recovery and outcome reconciliation behavior. A deadline aborts Copilot and cancels validation children. Preserve these distinctions rather than replacing them with an unbounded retry loop.

Only successful full validation can produce verified state and a publishable patch. A genuine no-change outcome can produce a state-only patch. The reported outcome must agree with the actual selected-sample changes.

Migration jobs have Copilot access but no repository-write credential. Agent shell tools are disabled. Writes remain confined to the selected destination; automation, skills, upstream files, Git metadata and frozen context are protected. Validation subprocesses use a sanitized environment.

Publication verifies every prepared patch against the original base, packages evidence, and creates or reuses one coordinated handoff issue. Copilot cloud agent owns subsequent implementation adjustments and the PR. With the optional assignment token, assignment is automatic; otherwise the issue is prepared for manual assignment. Preserve issue reuse and moved-base rejection.

## Initial sample inventory

Upstream is `OfficeDev/Microsoft-Teams-Samples`, configured ref `main`, root `samples/TeamsSDK`. The inventory was inspected at commit `b9aedfea98e3505acbcf68a3931be05a780d6149`. This is research provenance, not a request to permanently pin scheduled synchronization to that commit.

| Sample | Source relative to upstream root | Proposed destination |
| --- | --- | --- |
| `agent-targeted-messages` | `agent-targeted-messages/nodejs/agent-targeted-messages` | `samples/nodejs/teams/agent-targeted-messages` |
| `bot-ai-messages` | `bot-ai-messages/nodejs/bot-ai-messages` | `samples/nodejs/teams/bot-ai-messages` |
| `bot-attachments` | `bot-attachments/nodejs/bot-attachments` | `samples/nodejs/teams/bot-attachments` |
| `bot-cards` | `bot-cards/nodejs/bot-cards` | `samples/nodejs/teams/bot-cards` |
| `bot-meetings` | `bot-meetings/nodejs/bot-meetings` | `samples/nodejs/teams/bot-meetings` |
| `bot-message-extensions` | `bot-message-extensions/nodejs/bot-message-extensions` | `samples/nodejs/teams/bot-message-extensions` |
| `bot-task-modules` | `bot-task-modules/nodejs/bot-task-modules` | `samples/nodejs/teams/bot-task-modules` |

Also observed upstream: `bot-quickstart`, `bot-auth-quickstart`, and `bot-proactive-message` Node samples. Keep these out of the first configured set.

Revalidate source paths and inspect every selected sample before implementing its mappings or contracts. Detailed source inspection during design covered cards and message extensions; it did not establish complete feature parity for all seven. Do not assume the Node and .NET versions expose identical behavior merely because names match.

## Architecture and design requirements

### 1. Shared coordinator and language adapters

Introduce a small, explicit language interface with .NET and JS implementations. Put differences where they originate so callers do not accumulate repeated `if (language === ...)` branches.

An adapter should own the language-specific implementation of:

- Policy parsing/validation and compatible SDK package selection.
- Project/package inspection, dependency preparation, build and runtime smoke checks.
- Source-derived Teams capability extraction for manifest comparison.
- Required behavior contracts and any supported sample-local tests.
- Language-specific guidance and relevant validation-input fingerprints.

Keep configuration loading, source evidence, immutable planning, session protocol, containment, digest mechanics, result envelopes, patch verification and handoff in shared modules. Shared manifest validation should consume normalized capability facts rather than parse C# or TS itself.

Do not design an extensive plugin framework for hypothetical languages. Two concrete adapters are enough to establish the real seam. Python should later add an adapter, profile, skill, contracts and workflow runtime setup without copying the coordinator. It may still require small registry and workflow updates.

Before coding, write down the minimal adapter interface and invariants in the implementation notes. The method names and exact module layout are implementation choices; prefer a small interface that hides substantial language behavior over one method per existing helper.

### 2. Configuration and target identity

Keep shared upstream, manifest and Copilot settings at the appropriate shared level. Language profiles should own destination root, canonical guidance, migration skill, runtime requirements, package policy, output exclusions and selected targets.

Use an explicit language/sample identity in every serialized record and lookup. A display value such as `js/bot-cards` is not automatically a filesystem-safe identifier. Centralize rendering for artifact names and paths; validate identifiers before interpolation.

Carry identity through plan keys, matrix entries, source context, validation results, state, result metadata, artifact directories, concurrency groups, summaries, bundles, issue deduplication and patch verification. Same-name .NET and JS targets must never overwrite, match, or reuse each other's evidence.

Validate unknown languages, unknown samples, malformed policy, unsafe source/destination paths, and duplicate or overlapping destination roots. Checking only exact duplicate strings is insufficient if one target contains another target's directory.

Manual dispatch should select a language or all configured languages, and a sample or all. Define ambiguous or absent combinations explicitly: recommended behavior is that a named sample with `language=all` selects its configured variants and fails if none exist. Default scheduled runs should cover all enabled profiles. Do not enable Python implicitly.

Keep coordinated publication across the selected set. If a run selects both languages and one selected migration fails, neither language is handed off from that run. If language-independent publication is desired later, treat it as a separate policy change.

### 3. Serialized contracts, state and incremental planning

Current versions are targets v1, plan v3, context v2, state v2, validation v2 and result v4. Introduce explicit version changes wherever shapes or interpretation change. Update producers, consumers, fixtures and rejection tests together.

Existing .NET state lives at `automation/teams-sample-sync/state/<sample>.lock.json`. Choose and document the new namespaced layout. Provide an explicit .NET-only legacy read strategy or controlled migration; a JS target must never consume an old unqualified .NET state file.

Preserve usable previous upstream history when migrating state, while treating incompatible validation/input evidence as requiring revalidation. Do not claim an old output is verified under the new adapter merely because the source tree is unchanged. Specify how stale or duplicate legacy state is handled.

Freeze language policy and resolved SDK selections in the plan. Migration and publication must verify that their configured identity and policy still match that plan. Do not re-resolve packages independently midway through a run.

Fingerprint shared coordinator inputs and the selected language's relevant inputs. Changes to the JS skill, contracts or package policy should reschedule JS targets. Shared behavior changes should invalidate every affected language. Avoid silently dropping current invalidation coverage; document any intentionally conservative invalidation.

New-candidate detection must check that a source variant for the selected language actually exists. A top-level upstream sample directory alone does not prove that it contains Node or Python code. Continue reporting candidates without automatically enabling them.

### 4. SDK versions and npm dependencies

The current resolver is .NET-specific: GitHub releases, NuGet package indexes and a common major/minor line. Preserve its existing policy inside the .NET adapter. Do not apply its floating-version syntax to npm.

Define and test a JS policy that selects stable, compatible published packages, respects a configured floor/allowed major, excludes prereleases unless explicitly permitted, and records the exact selections used by a run. Check actual package metadata and dependencies rather than assuming all packages have identical versions.

Consult current official Agents JS source and package metadata before choosing package names, APIs or runtime requirements. During analysis, official guidance identified `@microsoft/agents-hosting-extensions-msteams` for new Teams extension development, with the older `agents-hosting-extensions-teams` deprecated. Recheck this at implementation time.

Validate declared dependencies, lockfile contents and installed versions. Detect prohibited legacy runtime dependencies and imports, but do not blanket-ban every `@microsoft/teams.*` package: determine whether a supporting cards package is intentionally retained and supported.

The agent cannot run shell commands. Initial imports and dependency edits therefore need a trusted dependency-preparation path that can produce/update `package-lock.json`. Make this deterministic coordinator/adapter behavior, confined to the selected sample, rather than asking the agent to invent lockfile contents or enabling unrestricted shell access.

Use a finite, documented sequence: prepare permitted dependency changes and lockfile, install reproducibly, validate the resolved packages, build, run contracts and smoke checks. Ensure lockfile changes are included in final output digests, self-audit/outcome handling and the patch. Repeated validation of unchanged input should not churn the lockfile.

Define the lifecycle-script policy explicitly. Keep credentials stripped and use trusted bounded commands. Avoid inheriting the quickstart's recursive build/install behavior accidentally: its `prebuild` invokes `npm ci`. Review the sample's scripts before executing them and prefer deliberate CI commands.

Classify registry/network/runtime infrastructure failures separately from repairable source failures. Preserve subprocess timeouts, cancellation, process cleanup and bounded diagnostic output. Account for Windows local development and Linux CI command invocation.

### 5. Migration skill and initial destination creation

Create a Teams SDK to Agents SDK TypeScript migration skill under `agent-plugins/agents-for-js/skills/`, following the plugin's established layout. Check plugin discoverability and any relevant catalog/documentation conventions.

The existing JS Bot Framework migration skill is not a replacement for Teams SDK guidance. The new skill should explain package replacements, `App` bootstrap migration, AgentApplication configuration, Teams extension routing, handler precedence, activity/invoke payloads and responses, state, attachments, cards, meetings, message extensions, task modules and targeted messages as applicable.

Preserve source behavior, exact commands and routing precedence. Base mappings on the installed selected SDK/source, not on similarly named .NET APIs. Document unsupported behavior as a blocker with evidence rather than silently dropping it. Keep manifest rules in the shared manifest skill.

Generalize the shared prompt and internal sync skill. Pass language-specific package/runtime guidance through immutable context and the selected migration skill. Remove assumptions that every destination already exists or uses project references and .NET release lines.

The initial JS destination directories do not currently exist. Define how trusted preparation creates only the allowed destination directory and any necessary assets without defeating read-only agent planning. The permission implementation currently resolves the sample root using `realpathSync`, so an absent root requires explicit handling.

Keep the distinction between absent verified state, initial source inventory and absent destination. These are related but not interchangeable conditions. Test first import into an empty destination as well as adoption of an already-existing sample without state.

`samples/nodejs/quickstart` is guidance, not a drop-in template: it has no canonical `appManifest` icon pair, and its `test` script launches the Agents Playground. Choose a documented manifest asset source and finite CI test setup. Do not fabricate binary assets through agent text edits.

### 6. Validation and manifest capabilities

Split the current validator by responsibility. Keep the shared result envelope, check statuses, full-validation requirement and current-output digest checks. Make required checks come from trusted language/target policy, never from a result's self-declared list.

Both full validation and the final acceptance assertion must use the same required-check policy. The existing hard-coded sample list for .NET contracts appears in multiple places; avoid carrying that duplication into the new design.

For JS, require project/package policy, reproducible dependency installation, resolved package checks, TypeScript compilation, manifest validation, finite behavior contracts and an HTTP startup check. A missing required contract is a failure, not a successful skipped check. Optional sample tests must not mask absence of protected contracts.

Separate language-specific source inspection from shared manifest comparison. Normalize relevant bot capability, command IDs/types and link-handler domains. Support the actual destination routing conventions; do not merely replace C# regular expressions with broad string-presence checks. Unsupported inspection must be reported explicitly rather than interpreted as no capabilities.

Retain released schema validation, package-local assets, duplicate-key detection, schema/version agreement and README command claim checks. Match commands by exact title/surface and message-extension IDs/types. Schema validity alone does not establish feature parity.

Keep protected contract tests outside the agent-writable sample. Use the real migrated handlers with deterministic fixtures and mocked external services. Assert outputs and behavior rather than method names or source formatting. Start with cards and message extensions, then cover each configured sample's key behaviors.

Make the HTTP smoke test finite, credential-free and language-aware. Verify the chosen health behavior and startup command against the actual host implementation; do not assume .NET startup flags or blindly copy its endpoint expectation. Clean up the process on success, failure and deadline cancellation.

### 7. File traversal, exclusions and containment

Current output exclusions mainly cover .NET artifacts. Add language-specific generated directories such as `node_modules`, compiled output and coverage, while preserving source, package metadata and lockfiles in the digest and patch.

`digestDirectory` currently traverses directories and rejects symlinks before applying file exclusions. Merely adding `node_modules/**` to YAML is insufficient: npm-generated executable links can fail traversal first. Prune excluded generated directories before descent. Apply compatible traversal rules to source inspection.

Continue rejecting unexpected symlinks in included source and assets, and preserve path confinement. Do not broadly disable symlink checks or let generated-directory exclusions hide tracked source changes from publication checks.

Maintain guards before and after trusted validation/preparation operations. If a command changes files outside the selected sample, the migration must fail. Keep automation tests and package caches from being mistaken for sample output, and never include secrets or dependency trees in patches.

### 8. Workflow, publication and repository integration

Prefer one generic sync workflow, with runtime setup selected from trusted language profiles/matrix values. Decide whether to rename the existing workflow file and update all tests/docs referencing it. Retain Node setup for the automation itself even for .NET targets.

Preserve default-branch-only dispatch, pinned checkout commits, read-only planning, per-target migration isolation, fail-fast disabled, existing permission separation and publication concurrency. Include language identity in per-target concurrency and artifact names.

Update artifact upload/download, result lookup, patch-verification paths, handoff bundling, issue titles, sample summaries and deduplication consistently. Validate the artifact's language, source tree, base, policy, plan evidence and state against trusted expectations. A JS result relabeled as .NET must not be accepted.

Verify that the combined selected patches can coexist: nonoverlapping targets and namespaced state are prerequisites. Preserve all-or-nothing publication, state-only no-change outcomes, moved-base rejection and existing issue assignment behavior.

Update ordinary sample CI to discover `samples/nodejs/teams/<sample>/package.json` without descending into dependency directories. Avoid turning a recursive search into execution of arbitrary nested fixture packages. Update sample indexes/README links as needed.

Reconcile runtime requirements. At analysis time the sample CI tested Node 20 and latest, the sync workflow used Node 24, and official Agents JS documentation required Node 22 or newer. Select supported versions using current evidence and scope any CI adjustment deliberately.

The sample workflow currently targets PRs against `main`. Account for the stacked PR base when reporting which checks will actually run. Do not silently loosen production dispatch restrictions just to test a feature branch.

## Implementation sequence and review checkpoints

1. Recheck instructions, branch, clean/dirty state, upstream inventory and current SDK compatibility. Record material changes from this brief.
2. Establish a baseline using existing automation checks and .NET contracts where the local runtime is available. Distinguish environment failures from regressions.
3. Introduce identity, profile configuration and serialized contract changes with tests for invalid inputs and legacy .NET state.
4. Extract the .NET adapter and split oversized coordinator/validator files. Demonstrate preserved .NET behavior before enabling JS.
5. Add JS package resolution, trusted lockfile preparation, project/build validation, source capabilities and runtime smoke support.
6. Add the JS migration skill, initial destination/asset handling and protected behavior contracts. Exercise cards first, then message extensions, then the remaining five samples.
7. Wire mixed-language planning, workflow selection, artifacts, verification and handoff. Test failure and no-change paths before enabling publication.
8. Integrate nested sample CI and documentation. Complete the full validation matrix, inspect the diff for scope/readability, and deliver a reviewable report.

These are logical implementation checkpoints, not permission to stage or commit. Keep Python implementation for a later PR. If the assignment is limited to infrastructure, state clearly that the initial seven migrated samples remain outstanding; do not claim full sample delivery.

## Code readability and file size requirements

Write code for human maintainers and reviewers. Prioritize obvious control flow and descriptive domain names over clever abstractions, compressed expressions or generic machinery.

- Maximum **500 physical lines per hand-written code file**, including imports, comments and blank lines. Aim below 400 when practical so files have room to evolve.
- Apply this limit to new files and modified existing code files. In particular, split oversized files that this work touches, such as the validator, into cohesive modules; do not use existing size as an excuse to keep expanding them.
- Do not refactor unrelated oversized files just to satisfy a repository-wide count. Record any pre-existing out-of-scope exceptions.
- Generated files, lockfiles, third-party schemas and vendored data are outside the hand-written-code limit. Do not regenerate or wrap them merely to reduce line counts. This handoff document is prose, not a code file.
- Do not evade the limit with single-line code, minified fixtures, giant inline strings or by hiding logic in data files.
- Split by responsibility: configuration, identity, language resolution, project validation, capability inspection, process execution and handoff have different reasons to change.
- Avoid arbitrary `part1`/`part2` modules, circular dependencies and a miscellaneous helper dumping ground. A file split should make ownership clearer.
- Use ordinary functions, explicit types at serialized boundaries, focused dependencies and early failures with actionable messages. Keep nesting and repeated branching modest.
- Follow existing TypeScript formatting conventions. Format multiline calls, objects and conditions consistently. Do not introduce an unrelated formatting rewrite.
- Comments should explain invariants, non-obvious constraints and why a choice exists. Avoid narrating obvious statements or speculative promises about future Python code.
- Use behavior-oriented test names, small fixtures and useful failure messages. Avoid tests that only mirror private implementation structure.
- Do not duplicate the workflow or validator for JS. Share mechanisms while keeping language policy explicit and local to its adapter.

Before handback, list line counts for new and modified hand-written code files. Explain any relevant exclusions. The human review should be able to follow an individual target from config to verified handoff without jumping through many trivial forwarding modules.

## Validation and acceptance matrix

At minimum, cover these cases with meaningful automated tests and focused integration checks:

| Scenario | Expected evidence |
| --- | --- |
| Existing .NET target | Same behavior and required checks after extraction |
| Empty JS destination | Complete initial import, lockfile, manifest assets and verified patch |
| Existing destination without state | Initial reconciliation without discarding destination behavior |
| Unchanged second plan | No migration scheduled when source, inputs and outputs match |
| Upstream behavior change | Only affected selected targets become pending; behavior preserved |
| SDK/package policy change | Relevant targets rescheduled with frozen compatible package selection |
| Manual destination drift | Target rescheduled even with unchanged upstream |
| Same sample name in two languages | Separate state, validation, artifacts, concurrency and reporting |
| Legacy .NET state | History retained where valid; incompatible evidence revalidated |
| Missing language variant | Clear candidate/removal policy; no fabricated source path |
| Lockfile missing or stale | Trusted preparation or clear failure; never a fabricated success |
| Legacy runtime dependency/import | Rejected according to explicit JS policy |
| Manifest route mismatch | Wrong/missing commands, types or domains fail |
| Missing required contract | Full validation fails, including final acceptance assertion |
| No sample changes required | Verified state-only patch with accurate outcome |
| Reported outcome mismatch | Existing reconciliation and revalidation behavior retained |
| Network/runtime infrastructure failure | Clear non-source failure, no misleading repair or handoff |
| Deadline expires | Agent abort and validation process cleanup; no publication |
| Out-of-scope write or source/context mutation | Guard failure |
| npm-generated files and links | Excluded traversal works without weakening source containment |
| Missing/failed/mismatched result | Entire selected publication blocked |
| Tampered patch, state or evidence | Verification fails |
| Base moves before assignment | Handoff rejected; rerun required |
| Publish disabled | Diagnostic/prepared artifacts retained, no issue created |
| Nested Node sample change | Ordinary PR sample CI discovers and builds the sample |

Existing local commands, from the repository root:

```sh
npm ci --prefix automation/teams-sample-sync
npm test --prefix automation/teams-sample-sync
npm run build --prefix automation/teams-sample-sync
dotnet test automation/teams-sample-sync/tests/contracts/TeamsSampleSync.ContractTests.csproj
```

Adapt commands if the refactor intentionally moves contracts. Add and document finite JS contract/build commands. Use repository formatting/lint checks appropriate to the modified files. Do not treat compilation alone as behavior validation.

Use temporary fixtures for planning and publication tests; do not mutate real synchronization state to simulate scenarios. Mock release/registry feeds and external services in deterministic tests. Test a real package install/build separately where dependencies and runtime are available.

The live Copilot smoke test is opt-in: `TEAMS_SYNC_SDK_SMOKE=1` with `npm run test:sdk-smoke --prefix automation/teams-sample-sync`. It consumes usage. Do not run it merely because this document lists it. Actual migration and handoff commands can also have substantial side effects; use them only within the worker's authorization.

For an authorized live rollout, begin with a non-publishing cards migration, then message extensions, then all seven. A feature-branch dispatch will currently be skipped by the default-branch restriction; use approved local/isolated verification rather than changing that safeguard casually.

## Completion report and eventual stacked PR

The worker's final report should state:

- What was implemented and which of the seven samples are complete.
- The adapter interface, state compatibility strategy and final package/runtime policy.
- Important behavior changes, including unavoidable revalidation of existing state.
- Tests actually run, their results, and checks that were blocked or not run.
- Remaining credentialed/manual checks and any unsupported upstream behavior.
- New/modified code-file line counts and confirmation of the 500-line requirement.
- Any material deviation from this brief and its reason.
- Git state: files changed and whether any staging, commits, pushes or PR actions were explicitly authorized and performed.

When PR creation is separately authorized, target `southworks/update/teams-sync-workflow` while it remains the unmerged parent. Recheck the stack before choosing a base: if the parent has merged or changed, update the branch relationship deliberately. Describe the final JS/refactor delta rather than repeating the parent's automation implementation.

## Primary references and research limitations

- Upstream samples: <https://github.com/OfficeDev/Microsoft-Teams-Samples/tree/main/samples/TeamsSDK>
- Inspected upstream snapshot: <https://github.com/OfficeDev/Microsoft-Teams-Samples/tree/b9aedfea98e3505acbcf68a3931be05a780d6149/samples/TeamsSDK>
- Agents JavaScript SDK and package overview: <https://github.com/microsoft/Agents-for-js>
- Existing .NET resolver references `microsoft/Agents-for-net` releases and NuGet package feeds; retain its tested behavior when extracting it.

Repository code is authoritative for the current automation. Official SDK source and published metadata are authoritative for the selected SDK version. Local skills may contain stale runtime guidance: resolve discrepancies explicitly rather than copying them into new policy. The design analysis did not prove runtime compatibility, execute a migration, or validate all seven JS behavior mappings.
