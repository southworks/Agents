# Real-agent acceptance

Run on an isolated Agents branch/checkout. Keep createPr disabled. Do not accept fork-only state into production.
Use a reviewed official baseline, then a controlled fork change. Each case requires an independently specified observable outcome.
Keep the original baseline for each case; do not chain unrelated cases through prior test state.

| Case | Independent expected outcome |
|---|---|
| Card field | Changed card data is visible with the expected value |
| Response text | The changed command returns the new text |
| Formatting only | No sample rewrite; evidence-backed non-applicable disposition |
| Already present | No duplicate behavior; destination location identified |
| New command | Handler works; manifest command decision explained |
| Removed behavior | Removal or explicit policy-backed preservation |
| Architecture difference | Behavior preserved through destination service/handler |
| Manifest capability | Correct capability, scopes and commands; schema passes |
| Missing manifest | Manifest generated from behavior evidence with approved sample placeholders; external setup reported separately |
| Capability with no manifest field | Explicit `no-manifest-field` decision backed by the applicable manifest reference; no invented field |
| Policy conflict | Reviewed policy followed; difference reported |
| Useful related addition | Addition implemented with clear benefit, evidence and validation in the PR report |
| Routine design choice without policy | Agent chooses a supported mapping without blocking |
| Missing support/security configuration | Blocked with evidence; no state or publishable patch |

Apply the generated patch in an isolated checkout. Verify each expected outcome through
the sample's actual handler, response or Teams UI. Use existing tests where applicable;
no dedicated project or production rule is required for an individual test change.

Run the same scenario at least three times from the same clean baseline. Record verdict,
cycle count, independent behavior result, code corrections needed, and false approvals.
Test reviewer rejection with deliberately omitted behavior and a false formatting explanation.
Stubs in the unit suite test orchestration only; they do not establish real-model accuracy.

Release gate: no known incorrect candidate approved in this set. Keep draft PR human review.
