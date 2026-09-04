# CI policy

The workflow has only `plan`, `migrate`, and `publish` jobs and only a manual dispatch trigger. Plan and migrate use read-only repository credentials. Migrate has `copilot-requests: write` but no repository write credential. Publish has repository and pull-request write access, no Copilot access, and does not execute candidate code.

Use one deterministic branch per sample: `automation/teams-sample-sync/<sample>`. Do not overwrite a branch with an open pull request. Create draft pull requests only; never auto-merge. Do not schedule this workflow.

The PR report includes upstream commits and paths, semantic changes, preserved Agents differences, policies, transient manifest report, build, HTTP smoke, contracts, manifest validation, output digest, and required external Teams checks.
