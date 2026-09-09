# CI policy

Plan, migrate, and publish remain separate jobs. Migrate has no repository-write credential and
Copilot can modify only the selected sample. Publish runs no Copilot session and never executes
candidate code. Protected automation, policy, state, context, source, contracts, Git metadata,
and upstream are outside the agent write boundary.
