# Teams sample synchronization

This internal automation synchronizes the seven selected Teams SDK .NET samples into their
Agents SDK counterparts. It has distinct plan, migrate, and publish jobs. Migrate has no
repository-write credential; publish neither invokes Copilot nor executes candidate code.
Manual dispatch remains the only trigger and `createPr` remains false by default.

## Runtime and flow

The migration runtime is pinned to `@github/copilot-sdk` 1.0.7 and its compatible
`@github/copilot` runtime 1.0.83. The SDK adapter explicitly resolves the platform package's
executable export because this SDK release's automatic `/sdk` lookup is incompatible with
the CLI package's exports. Runtime startup/version negotiation has been checked locally;
a live model migration remains a separate integration check. The workflow
does not install a separate global CLI. Node 24
and .NET 8 are used in CI. The local tool uses an SDK client for one persistent implementation
conversation, exposes narrow validation/schema/result tools, validates the current candidate,
then creates a separate read-only reviewer session. Up to two post-review repairs are allowed
within a 30-minute per-sample deadline.

The implementation result is versioned evidence containing every source disposition and a
single capability inventory. Validation binds to the sample output digest. Review binds to the
output digest, canonical evidence digest, and validation run ID. Version-3 result artifacts
record these bindings, stage metrics, diagnostics, event log, runtime policy, and observed model
metadata. Old transient v2 artifacts are intentionally rejected by publishing; persisted v2
checkpoints remain readable.

## Run and diagnose

From the repository root:

```sh
npm ci --prefix automation/teams-sample-sync
npm test --prefix automation/teams-sample-sync
npm run build --prefix automation/teams-sample-sync
dotnet test automation/teams-sample-sync/tests/contracts/TeamsSampleSync.ContractTests.csproj
```

The SDK smoke test requires Actions-compatible Copilot credentials and is not run locally by
default. Offline tests cover the coordinator, evidence/digest gates, model policy and validation
boundary; they do not claim that a live Copilot service was exercised.

To run the live smoke test deliberately, set `TEAMS_SYNC_SDK_SMOKE=1` and run
`npm run test:sdk-smoke --prefix automation/teams-sample-sync` with Copilot credentials.
This sends model prompts and consumes usage. Without the opt-in it is skipped.

`config/targets.yml` uses `strategy: capability` for implementation and review. The runtime
catalog is queried and the coordinator selects an enabled model that advertises the configured
reasoning capability and preferred effort. The catalog controls the model identifier; no model
name is baked into the repository configuration. When GitHub Actions credentials cannot use the
`models.list` endpoint, as in the pilot, the configured `fallback: auto` routes through Copilot
Auto. In that case no effort is sent and the resulting model and available metadata are recorded
in the run artifact and PR description.

An administrator can intentionally use `strategy: explicit` with a concrete `model` and
`reasoningEffort` for a controlled experiment or a temporary operational requirement. An
unavailable explicit model is a CI configuration failure. `strategy: auto` is also available and
does not query the catalog. Capability policies can additionally set `minimumContextTokens`,
`maximumCostMultiplier`, and `fallback: auto|fail`. Candidates must advertise enabled policy and
the required metadata; reasoning compatibility is checked before cost ordering. Unknown metadata
is not treated as zero cost or unlimited capacity. The pinned SDK supports low, medium, high, and
xhigh effort. Selection by these constraints does not guarantee model quality; compare real
migration outcomes before changing the policy.

Agent-authored regression tests use one `tests/*.csproj` inside the selected sample.
Exclude `tests/**/*.cs` from the sample application's compile items when necessary.
Both `code` and `all` validation groups run these tests and applicable protected contracts;
only `all` can authorize review/publication. Nested test `bin`/`obj` output is excluded from
source digests. Credentialed Teams/Graph/UI coverage limitations remain explicit in the PR.

For an authorized pilot, use an isolated fork with `createPr: false`, begin with
`agent-targeted-messages`, and test initial import, an incremental behavior delta, malformed
evidence, and an unchanged rerun. The plan job checks out the default branch, so ensure it
contains this refactor before testing a branch. Artifacts include `sync-result.json`,
`source-context.json`, `agent-log.txt`, `agent-events.jsonl`, and `workflow-summary.md`;
publishable artifacts additionally contain `change.patch` and `pr-body.md`. A valid structured
`needs-policy` or `unsupported` result is a reportable outcome: the workflow succeeds and, with
`createPr`, opens a draft report-only PR. Its leading **Not included / requires a decision**
section identifies the omitted behavior, reason, affected source changes, and policy request.
Partial candidate edits, failed validation, invalid agent evidence, authentication, runtime, or
integrity errors remain CI failures and cannot create a report PR.

Submission validation failures return `accepted: false` with an actionable error and correction
instruction. Repeating an unresolved diagnostic twice stops the session even if unrelated report
text changes. Rejection counts and diagnostics are recorded in the artifact events. Every completed
validation is also recorded immediately; failed runs retain the latest completed validation with
its candidate digest, which is diagnostic evidence and never substitutes for publication approval.
