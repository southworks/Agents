# Python Teams samples execution evidence

All seven Python Teams samples are implemented under `samples/python/teams` from
pinned OfficeDev source through the synchronization coordinator. Their exact
verified patches and coordinator-generated state are integrated in this worktree.
PR #118, its code and its evidence were excluded throughout.

Local validation is complete for the seven-sample baseline. Live tenant validation
belongs to the user and has not been executed or reported. The isolated changed-input migration also passed; its output is excluded from the baseline.

## Frozen inputs

| Input | Identity |
| --- | --- |
| Integrated sample revision | `623c82dcff583c9bb35588bc15ce10ee20b78ea5` |
| Generation base | `50e0594eb292cc9479a6588242d96c0966ba7b35` |
| OfficeDev source | `b9aedfea98e3505acbcf68a3931be05a780d6149` |
| Upstream source directories | `samples/TeamsSDK/<sample>/python/<sample>` |
| Agents SDK | All five required packages at `1.9.0` |
| Python | CPython `3.11.14`, Linux x86_64 |
| Node | `24.22.2` |
| Copilot SDK / CLI | `1.0.7` / `1.0.83` |

The package selection identity and per-sample input, output, plan and artifact hashes
are recorded in [execution results](python-teams-samples-execution-results.json).
Each sample includes the trusted resolver's hash lock, README, environment template,
manifest and icons. Setup uses a fresh environment and `--require-hashes`; the locks
are specific to the documented runtime/platform.

## Sample results

Every row passed the full coordinator validator, independent patch verification in
a clean checkout at the generation base, and the fresh-environment sample CI check
in the combined seven-sample checkout.

| Sample | Reviewed behavior |
| --- | --- |
| `bot-cards` | Both commands, nested forms, submitted names, precedence and visibility |
| `bot-ai-messages` | Keyword priority, AI/sensitivity metadata, complete citations and both feedback invokes |
| `bot-message-extensions` | Search results, sanitized snippets, malformed/default HTTP responses, no results and link previews |
| `bot-task-modules` | All three dialogs, name/email carry-forward and the hosted custom page |
| `bot-attachments` | File consent, early acknowledgement, real transfer helpers, failure fallback and background cleanup |
| `bot-meetings` | Meeting events, supported default metadata API, resource-ID precedence, organizer-scoped join-URL recovery, VTT and retries |
| `agent-targeted-messages` | Private delivery, real timer delay, ownership, cancellation/snooze, reactions and task cleanup |

Full validation covers project layout, dependency restoration and installed packages,
compilation, import, protected behavior contracts, HTTP smoke and manifest checks.
HTTP smoke verifies credential-free readiness and rejection of anonymous messages
with synthetic configured credentials; HTTP 200 and HTTP 500 both fail the latter.
The additional recorded probes returned readiness 200 and anonymous POST 401.

Independent review compared source, behavior requirements, actual SDK APIs, manifests,
README setup and frozen plans. It exposed defects that injected happy-path tests
missed. Corrections went back through the coordinator, followed by full validation
and renewed patch verification; generated code and synchronization state were not
hand-edited to make evidence pass.

The main corrections were typed authentication configuration, literal feedback invoke
routes, malformed Wikipedia response handling, reminder delay/cleanup/ownership,
and the actual Agents SDK `TeamsTurnContext.api_client` meeting metadata API.
Supplementary tests exercise default timer and metadata paths, transfer failures,
join-URL Graph requests and anonymous HTTP rejection.

## Shared automation checks

- Ubuntu automation build, lint and tests passed: 116 tests passed, one opt-in skip.
- Python helper checks passed on Windows: 62 tests.
- Python helper checks passed on Ubuntu: 62 tests, one Windows-only skip.
- The live Copilot SDK planning/implementation smoke passed during preparation.
- The exact integrated sample bytes and state match their verified patches; Git's
  whitespace check passes.

Windows path-length handling and actionable validator errors were repaired before
freezing generation inputs. Later authentication checks strengthened the validator
before the final baseline was generated. Superseded attempts remain archived in the
local execution workspace and do not count as accepted results.

## Integration and synchronization

The CLI `prepare-handoff` accepted the coordinated seven-sample result set at the
common base and packaged its patches, plans, audits, source context and results.
Complete output directories and combined test logs are retained in
`.sync/current50-evidence`; the machine-readable report above pins their hashes.
The native execution workspace is `/home/joelmut/teams-sync-execution-20261105` in
Ubuntu WSL. No hosted workflow, issue, PR, push or merge was created by this execution.

A new plan against the combined baseline and identical upstream, SDK and automation
inputs marks all seven samples unchanged and produces an empty migration matrix.

An isolated copy of upstream contains a real local documentation commit affecting
only the cards README (`7bc84c6`). Planning selects only `bot-cards`, while the other
six remain unchanged. This is a controlled changed-input experiment, not a claimed
OfficeDev release. The selected coordinator migration and independent patch verification passed in a separate checkout. Its patch changes only the cards README and generated cards state; it is excluded from the baseline.


Identical inputs were skipped during planning. The changed-input experiment was a
selected, fully revalidated documentation update, rather than a no-code-change,
state-only migration. No synchronization state was fabricated for either check.

## Tenant test handoff

Follow the [tenant checklist](python-teams-samples-tenant-test-checklist.md) from the
exact final baseline revision. Record each scenario as passed, failed or blocked,
including the tested revision and sanitized observations. Local mocks and synthetic
credentials do not prove Teams delivery, Entra consent, Graph access, file transfer
or client behavior.

The meetings setup preserves the existing .NET sample's Graph application permission
and organizer-access-policy requirements. No tenant permissions or credentials were
changed. Remaining live results are explicitly pending with the user.
