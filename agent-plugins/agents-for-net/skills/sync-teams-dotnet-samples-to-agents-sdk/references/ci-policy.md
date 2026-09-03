# CI and Pull Request Policy

## Trust separation

- Fetch upstream before agent execution.
- Do not build upstream projects.
- Give the migration agent repository read/write access only to the isolated checkout. Do not give it pull-request write credentials.
- Authenticate GitHub Copilot CLI with the job `GITHUB_TOKEN` and `copilot-requests: write`. Do not require an OpenAI key or a personal token.
- Pin the Copilot CLI version. Expose only edit, view, grep, and glob tools. Disable shell, URL, memory, GitHub MCP, and runner temporary-directory access.
- Compile the validator outside the agent-writable workspace. After each agent pass, reject every changed path except the selected sample and the permitted initial proposal record.
- Create or update pull requests in a later trusted job.
- Attest each validated proposal commit with repository-side provenance before human resolution.
- Validate a human decision with read-only permissions. Use a separate `workflow_run` finalizer with trusted default-branch code for branch writes.
- Never execute candidate scripts or sample code in the write-capable finalizer.
- Run on an ephemeral runner without deployment, tenant, Azure, Graph, or Teams credentials.
- Pin the agent, runtime, and third-party actions before enabling a schedule.

## Branch and concurrency

Use one deterministic branch per sample:

`automation/teams-sample-sync/<sample>`

Use one concurrency group per sample. Do not overwrite a branch that has an open pull request. Resolve, merge, or close it before a new synchronization.

## Pull request content

Include:

- Previous and current upstream commits.
- Upstream sample tree ID.
- Input and output digests.
- Behavior, dependency, configuration, asset, and manifest changes.
- Preserved Agents SDK differences.
- Applied or proposed decisions.
- Exact tentative code and one-click approve/reject suggestions when a decision is proposed.
- Local validation and idempotence results.
- External validation still required.

Keep the pull request draft while decisions or validation remain unresolved. Never auto-merge.

## Schedule rollout

Start with `workflow_dispatch`. Exercise every acceptance scenario. Enable the prepared weekly schedule only after repeated clean manual runs.
