# Synchronization Contract

## Sources of authority

Use this order:

1. `targets.yml`: selected samples and intended destination behavior.
2. Active approved or rejected entries in `decisions.yml`.
3. `ownership.yml`: files the automation can and cannot change.
4. Current Agents SDK destination sample.
5. Current and previous upstream sample versions.

Upstream is the source of feature changes, not the authority for Agents SDK architecture or product intent.

## Three-way comparison

For one selected sample, compare:

- Previous upstream sample at the last recorded upstream commit.
- Current upstream sample at the planned commit.
- Current Agents SDK destination sample.

Classify changes as behavior, dependency, configuration, documentation, asset, manifest capability, rename, deletion, or unsupported.

## Ownership

Match paths relative to the destination sample. Apply the first matching precedence class from `ownership.yml`:

1. `human-owned`
2. `agents-owned`
3. `generated`
4. `template-owned`
5. `upstream-owned`

- `human-owned`: never edit automatically.
- `agents-owned`: preserve Agents SDK design; edit only for an approved Agents requirement.
- `generated`: recreate deterministically from declared inputs.
- `template-owned`: refresh from the configured canonical Agents sample, then merge sample-specific values.
- `upstream-owned`: preserve source behavior while adapting it to Agents SDK.

## Reconciliation input

The deterministic input digest includes:

- Configured upstream .NET source-tree Git ID.
- Selected target configuration.
- Applicable durable decisions.
- Ownership rules.
- Migration skill tree digest.
- Manifest skill tree digest.
- Canonical quickstart tree digest.
- Package policy.
- Validator version.

A changed digest requires reconciliation even when upstream source did not change.

Record verified state in `state/<sample>.lock.json`. One lock per sample prevents unrelated sample pull requests from conflicting.

Do not record state for a proposed decision. After human resolution, recompute the input digest with the durable decision. For approval, the output must match the candidate digest. For rejection, the output must match the safe-base digest after exact patch reversal.

## Output and idempotence

Hash all destination files in stable relative-path order. Exclude build output and local tool files listed in `ownership.yml`.

After verification, run the same reconciliation again from the resulting tree. The second output digest must equal the first. Otherwise return `non-deterministic` and do not prepare a ready pull request.

Do not emit timestamps or run identifiers into generated sample output.

## Decision transition

Permit one unresolved decision per selected sample. The human edit changes only `status: proposed` to `approved` or `rejected`. All proposal metadata must remain unchanged. Reject stale heads, changed candidate output, patch mismatch, upstream mismatch, multiple proposals, or any status commit that edits another file.
Recompute the proposal input digest without the resolved decision. It must match the recorded pre-proposal input. A proposal patch can target only paths under its selected destination sample.
