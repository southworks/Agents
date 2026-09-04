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

Policy has no draft or approval status. A merged repository pull request is the authority. If no policy resolves missing or conflicting product intent, return `needs-policy` with evidence and suggested YAML. Do not implement the suggestion, write state, or open a sync pull request. A later manual sync consumes the reviewed policy.
