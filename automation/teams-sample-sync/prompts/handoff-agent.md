# Teams sample sync handoff

The workflow completed and verified each migration independently. Assemble its prepared changes on your Copilot PR branch, then perform one focused final audit. Do not redo the migrations.

1. Read `handoff.json` and `plan.json`. Confirm that the PR targets the intended repository branch and that its base still matches `baseSha`. If the base has moved or the artifact cannot be downloaded, explain the blocker in the draft PR and stop.
2. In `handoff.json` order, check each `samples/<sample>/change.patch` against its recorded `patchDigest`, apply it, and review the resulting diff. Make one commit per selected sample when the agent environment supports that. Every selected sample must appear in the final PR regardless of how the agent records commits.
3. Read each `migration-plan.md`, `self-audit.md`, `source-context.json`, and `sync-result.json`. Check the final handlers, README/help text, manifest, and package references against the plan and source context. Fix clear omissions within the selected samples and revalidate anything you change. Keep the coordinated set together.
4. Confirm the final PR contains every planned sample and only the expected sample and synchronization-state paths. Use `pr-title.txt` and `pr-body.md` for the PR title and body. Add a short final-audit note explaining any corrections and validation you performed; link to the workflow for detailed evidence.
5. Request human review only when the complete set is ready. If any patch cannot be applied or verified, leave the PR as a draft with a specific blocker. Do not claim that the sync is complete.
