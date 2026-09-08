# Synchronization contract

`targets.yml` selects the fixed samples and the Copilot model configuration. `migration-policy.yml` is the human product authority. `ownership.yml` protects paths. The deterministic input digest includes source tree, target configuration, applicable policies, protection, both skills, canonical sample, Copilot configuration, package policy, and validator version.

Use `copilot.model: auto` to let Copilot select the best available model for the task. Do not set `copilot.reasoningEffort` with `auto`. To pin an explicit model, run `copilot` and enter `/model` to see the models and effort levels available to your account. For an explicit model, `copilot.reasoningEffort` is optional; allowed values are `low`, `medium`, `high`, `xhigh`, and `max`. Availability can depend on the Copilot plan and organization policy.

`plan` resolves one exact source commit and outputs pending samples. The configured workflow repository also determines source identity in context and reports.

`migrate` provides immutable hunk evidence and both source snapshots. Initial mode inventories all source files. Evidence over 2 MB fails explicitly without truncation. Each implementation cycle is followed by validation and an independent read-only review. Five cycles maximum; repeated findings without progress stop earlier. Repairs receive the cumulative implementation report and previous review.

The implementation agent returns updated/unchanged for review, needs-policy, or unsupported. The reviewer returns approved, changes-required, or blocked. Updated and unchanged are not approval. State v2 is written only after complete change accounting, manifest assessment, successful validation and independent approval of the exact output digest. Blocked/rejected results produce no state or publishable patch. A state-only acknowledgement is allowed with evidence and approval.

Primary artifacts are sync-result.json, change.patch (only on success), and agent-log.txt. source-context.json preserves diagnostic input. Human summaries and PR bodies are rendered from the structured result. Separate agent-result.json, validation.json and final-state.json are no longer emitted.

Existing trusted tests remain protected. Agents propose additional tests in their verification evidence; executing agent-authored tests outside the selected sample is not enabled. A passed build or schema check does not prove semantic equivalence. Missing contract coverage is reported as not configured.

`verify-patch` runs in the write-capable publish job without building or executing candidate code. It permits only the selected destination and its state lock, rejects protected evidence paths, and compares the output digest and state to the validated result.
