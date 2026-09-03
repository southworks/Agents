# Decision Policy

## When a decision is required

Create a review boundary before changing behavior that requires unapproved product intent, including:

- Teams installation scopes.
- Graph, RSC, delegated, or application permissions.
- Identity, tenant, OAuth, domain, or endpoint values.
- Copilot exposure or distribution.
- Calling, video, meetings, notifications, or other externally configured capability exposure.
- Removal of existing Agents SDK behavior.
- A change to `human-owned` or `agents-owned` policy.

## Proposal

Add one `proposed` entry to `decisions.yml` with a stable ID, sample, question, recommendation, evidence, impact, and invalidation conditions. Complete independent safe migration work, but leave the blocked behavior unchanged.
Use the next unused zero-padded `DEC-000` number. Never reuse an ID.

The proposal implementation pass applies only the recommendation as tentative code. `sync capture-proposal` records:

- Pinned upstream commit and source tree.
- Safe-base and candidate output digests.
- Proposal input digest.
- Exact reversible patch and patch digest.

The draft pull request contains the safe changes, tentative code, proposal record, and exact proposal patch. Post two review suggestions on `status: proposed`: `approved` and `rejected`. A user with repository write permission applies one suggestion. A general pull-request approval does not resolve the product decision.

Use `/sync-decision DEC-000 approve|reject` only as a fallback. It must use the same targeted check. It must not rerun the full synchronization.

## Durability

- `approved`: retain the tentative code and record `authority`, `decidedBy`, and `decidedIn`.
- `rejected`: reverse only the exact proposal patch; retain safe changes and the negative decision.
- `proposed`: permit only isolated tentative implementation; never finalize state.
- `superseded`: retain provenance but do not apply.

The status edit starts a read-only targeted build and validation. A trusted finalizer verifies the exact head SHA, human permission, proposal patch, digests, and pinned upstream revision. It updates the same draft pull request and state without another agent run. Stop if any value is stale or ambiguous.

Approval or rejection becomes durable only when the pull request merges. Normal code review and merge approval remain separate.
Retain the immutable proposal patch as decision evidence. Do not reuse or modify it.

Reopen a decision only when an `invalidatesOn` condition is observed. Report the observed condition in the new proposal.
