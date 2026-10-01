# Teams sample synchronization

This workflow synchronizes selected Teams SDK .NET samples into their existing Agents SDK
counterparts. Its synchronization jobs are plan, migrate, and handoff. Migration has Copilot
access but no repository-write credential. The handoff job verifies the candidates and assigns
the issue to Copilot cloud agent; it does not execute candidate code. A publication-check job inspects
sync PRs using trusted base-branch tooling and never executes PR code. A separate finalization job
restores prepared PR metadata after Copilot finishes and marks the verified PR ready for review.

The workflow runs every Sunday at 00:00 UTC for all configured samples. Dispatch manual runs from
the repository's default branch; other refs are skipped. Manual runs can select one
sample or all samples and can enable or disable publication. Migrations run independently, but the
selected samples publish as one coordinated set: if any migration fails, no handoff issue is created.

For each changed sample, one persistent Copilot implementation session first creates a Markdown
migration plan without write permission. The coordinator saves and hashes that plan. The same
session then uses the Teams-to-Agents and manifest skills to implement it, validate its work, and
self-audit the final files against the frozen plan. The workflow independently runs the full
validator, allows one repair turn for deterministic failures, and publishes only a verified patch.
If the implementer's reported outcome disagrees with the selected sample's actual changed files,
the session gets one reconciliation turn and another full validation pass. A continuing mismatch fails
the sample.
When verification finds that no selected-sample file needs a change, the published patch contains
only synchronization state and is explicitly reported as **no changes required**.

The handoff job verifies every patch against the planned base and uploads one bundle containing the
ordered patches, frozen plans, self-audits, source contexts, result metadata, and a prepared PR description.
It first creates or reuses an unassigned issue so `pr-body.md` can include its actual `Fixes #<number>`
reference. After uploading the bundle, it updates the issue with the artifact link, literal PR title,
and publication instructions, then assigns Copilot. It does not push a branch or generate separate
PR-title or agent-instruction files.

Copilot applies every prepared patch exactly on its own PR branch, creates a draft PR linked to the
handoff issue, and stops. It does not wait for checks or request human review.
It must not add fixes, refactoring, formatting changes, or dependency updates. Missing behavior,
artifact failures, patch failures, or a moved base are reported in the issue; the PR stays a draft.
Corrections must go through migration and validation again. The publication check reconstructs the
expected Git tree from the artifact patches and compares the entire PR tree, title, and description.
It rejects missing or additional changes, including synchronization-state differences.

When `Running Copilot cloud agent` completes, finalization locates the associated PR and reads its
current head, rather than the agent run's starting commit. It verifies the entire tree before updating
the title from the issue and the description from `pr-body.md`. It rechecks the base branch, base and
head commits, open status, and metadata before marking the PR ready with `gh pr ready`, then verifies
the resulting state again. Verification failures before the ready transition keep the PR draft;
a readiness failure fails the job and can be retried. Changes detected after the transition fail
the publication check. Already matching metadata is left alone. Closed PRs are skipped, and
already ready PRs are verified without editing them. Verification and finalization are queued together
so their results cannot race.

The optional `finalize_pr_number` input is for manual recovery only: enter an existing PR number, such
as `56`, to retry finalization without planning, migration, issue creation, or Copilot assignment.
It is a string so the default can be blank; entered values must be positive whole PR numbers, not
`true` or `false`. Leave it blank for normal sync. Automatic completion-triggered finalization finds
the PR from the Copilot run and does not use this input.
Both publication jobs report a `Teams sync publication` check on the PR's actual head commit.
While Copilot is active, verification leaves that check pending; finalization waits for completion
rather than overwriting a running agent's progress. Successful finalization marks the PR ready for
review automatically; other repository checks and review requirements still govern merging.

Failed runs retain their diagnostic artifacts and can be rerun manually. An interrupted handoff may
leave an unassigned issue; reruns reuse it when the base and verified outputs match. An already assigned
handoff is left untouched. Publication checks require the handoff artifacts to remain available and
the PR base to match the prepared base; rerun synchronization when that base moves.
An uploaded handoff remains verifiable if a later issue-assignment response fails: bundle upload is
already gated by successful migration and patch verification, rather than the run's final status.

Automatic assignment requires an Actions secret named `COPILOT_ASSIGNMENT_TOKEN` containing a GitHub
user token with permission to assign Copilot in this repository. GitHub's fine-grained token requirements
include metadata read and Actions, Contents, Issues, and Pull requests read/write access. The normal
handoff job's `GITHUB_TOKEN` retains read-only repository and Actions access. Verification additionally
writes check results; finalization can write check results, PR metadata, and review readiness but has no contents-write
permission. If the assignment secret is absent,
the handoff job fails before reserving an issue. The first live run should verify that Copilot
can download the artifact and apply its patches. Verify the completion-triggered finalization live
after deployment; use manual recovery if that trigger is unavailable or requires approval. Configure the
`Teams sync publication` check as required in repository branch protection to block
merging a PR that deviates from its handoff.

Copilot uses Auto routing. The workflow records the observed model for diagnosis but does not
select a model, enumerate a model catalog, or force a reasoning effort.

The workflow preserves pinned source commits, source context, selected-sample write confinement,
full validation, incremental state, and patch verification. It does not use a reviewer session,
agent-authored evidence schemas, or policy configuration.

Run locally from the repository root:

```sh
npm ci --prefix automation/teams-sample-sync
npm test --prefix automation/teams-sample-sync
npm run build --prefix automation/teams-sample-sync
dotnet test automation/teams-sample-sync/tests/contracts/TeamsSampleSync.ContractTests.csproj
```

The live Copilot smoke test is opt-in because it consumes usage. Set
`TEAMS_SYNC_SDK_SMOKE=1` before running `npm run test:sdk-smoke --prefix automation/teams-sample-sync`.
