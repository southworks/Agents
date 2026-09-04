# Synchronization contract

`targets.yml` selects the fixed samples. `migration-policy.yml` is the human product authority. `ownership.yml` protects paths. The deterministic input digest includes source tree, target configuration, applicable policies, protection, both skills, canonical sample, package policy, and validator version.

`plan` resolves one exact upstream commit and outputs only pending samples in its matrix. `migrate` uses the exact previous upstream, current upstream, and destination context. It writes version-2 state only after all deterministic validation succeeds. `needs-policy`, unsupported, and failed migrations never write state or a publishable patch.

`verify-patch` runs in the write-capable publish job without building or executing candidate code. It permits only the selected destination and its state lock, rejects protected evidence paths, and compares the output digest and state to the validated result.
