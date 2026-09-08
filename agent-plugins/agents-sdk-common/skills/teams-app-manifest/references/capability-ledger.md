# Capability ledger

Use this internal ledger to prevent source inspection, manifest editing, and final validation from becoming disconnected. It is working evidence, not a user-facing artifact, and is not persisted unless the caller explicitly requires it.

## Discovery

Inspect source code, routes, configuration, tests, and README documentation. Record every plausible Teams-facing capability before deciding whether it affects the manifest. Do not use a sample name as evidence. Read the relevant feature reference for each candidate.

Each entry contains:

```text
id | kind | evidence | classification | manifestPath | status | reference
```

- `id`: stable lowercase identifier unique within this manifest assessment.
- `kind`: concise feature category, not a schema field guess.
- `evidence`: one or more concrete source paths, symbols, routes, tests, or README sections.
- `classification`: `required`, `conditional`, `none`, or `unsupported`.
- `manifestPath`: actual JSON path in the final manifest for `required`; `none` otherwise.
- `status`: `present`, `needs-input`, `not-required`, or `unsupported`, respectively.
- `reference`: the manifest-skill reference that supports the decision.

## Reconciliation rules

- `required` means evidence and intended behavior require a declaration. Write it and record its actual final JSON path with status `present`.
- `conditional` means product intent or a value cannot be resolved safely. Use path `none` and status `needs-input`. Generate other verified manifest content first when possible.
- `none` means the capability was considered but the applicable reference says it has no manifest field. Use path `none` and status `not-required`.
- `unsupported` means the required behavior is unavailable in the selected released platform/schema. Use path `none` and status `unsupported`.
- Do not finish Generate or Complete with a missing required path or an unresolved conditional entry.
- Schema validity is necessary but does not prove this ledger matches the application's behavior.
- External portal, identity, domain, deployment, tenant, or subscription work does not invalidate a manifest fragment supported by evidence and repository-approved placeholders. Record that work separately.

Automation callers may request the ledger as structured in-memory report data so an independent reviewer can reconstruct and compare it. Do not create `manifest-evidence.md` or another ledger file by default.
