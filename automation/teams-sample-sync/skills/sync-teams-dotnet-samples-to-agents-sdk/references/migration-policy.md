# Migration policy

`migration-policy.yml` is human-managed repository policy. Each item has a unique lowercase `key`, a selected `sample`, and non-empty `instruction`, `rationale`, and `source`. Policies are sorted by key and only policies for the selected sample enter agent context. A policy change invalidates that sample state.

```yaml
version: 1
policies:
  - key: bot-meetings.installation-scopes
    sample: bot-meetings
    instruction: Preserve the current Agents SDK installation scopes.
    rationale: Do not adopt additional upstream scopes without product review.
    source: PR-123
```

Policy has no draft or approval status. A merged repository pull request is the authority. No policy is needed for routine SDK mappings, implementation choices, or evidence-backed related additions within the selected sample. Explain additions and their benefit, evidence and validation in the draft PR; the human reviewer decides whether to keep them. Do not invent unrelated features or override explicit policy.

Return `needs-policy` only for an explicit policy conflict or missing security-sensitive/external configuration that source and documentation cannot establish. Include evidence and suggested YAML. Do not implement that blocked choice, write state, or open a sync pull request. A later manual sync consumes the reviewed policy.
