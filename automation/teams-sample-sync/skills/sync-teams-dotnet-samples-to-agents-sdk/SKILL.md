---
name: sync-teams-dotnet-samples-to-agents-sdk
description: CI instructions for a bounded Teams SDK .NET to Agents SDK sample synchronization.
---

# Teams sample synchronization

This CI caller uses one persistent implementation session and one separate read-only review
session. Read `references/sync-contract.md`, then preserve source behavior with the smallest
necessary sample-only changes. Invoke the public migration skill before code changes and the
manifest skill after code stabilizes.

The CI exposes `validate_sample`, `inspect_manifest_schema`, and a structured submission tool.
There is no shell tool: use validation instead of asking to run `dotnet` directly. A passing
build is evidence only when returned by the current validation tool. Report corrections stay in
the same conversation and do not imply code edits. Two post-review repairs and a 30-minute
sample deadline are the maximum budget.

Run `validate_sample` with `code` during implementation and `manifest` during package work;
run `all` before submitting a successful result. Locally testable behavior changes should have
meaningful tests in the selected sample's `tests/*.csproj` projects, which the full validator
runs alongside protected baseline contracts. Never edit while validation is running.

Use the exact `submit_result` or `submit_review` schema supplied by the caller. Preserve
capability IDs across repairs; there is no separate assessor, parent-ID reconciliation, or
five-cycle implementation loop. The independent reviewer receives the full current evidence
and validation result, inspects source and candidate, and gives concrete blocking findings.
