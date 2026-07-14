---
name: agents-sdk-to-prod
description: Guide the user to create or adapt a Microsoft 365 Agents SDK sample into a production-ready sample with selectable features.
disable-model-invocation: true
---

This skill is designed to help and guide the user to create a Microsoft 365 Agents SDK sample or adapt an existing one into a production-ready sample with selectable features and best practices. It will ask the user to select which production features they want to implement, and then guide them through the process of implementing those features in their sample.

Use the supported feature references before making implementation decisions. Read only the references for the baseline and the selected or detected features.

## Supported Features
- `required-baseline`: Production baseline checklist, required auth shape, safe defaults, and a minimal hardened sample shape. Reference: [required-baseline.md](./references/required-baseline.md).
- `persistent-storage`: Replace volatile memory storage with Azure Blob Storage or Azure Cosmos DB. Reference: [persistent-storage.md](./references/persistent-storage.md).
- `health-readiness`: Add health and readiness endpoints for hosting platforms and dependency probes. Reference: [health-readiness.md](./references/health-readiness.md).
- `jwt-authentication`: Require JWT authentication for the messages endpoint and protected custom routes. Reference: [jwt-authentication.md](./references/jwt-authentication.md).
- `rate-limiting`: Add rate limiting to public endpoints. Reference: [rate-limiting.md](./references/rate-limiting.md).
- `downstream-auth`: Protect downstream API access with user authorization handlers and token exchange. Reference: [downstream-auth.md](./references/downstream-auth.md).
- `payload-limit`: Limit JSON request body size when owning the Express app or custom routes. Reference: [payload-limit.md](./references/payload-limit.md).
- `proactive-endpoints`: Secure proactive and custom endpoints, store conversation references, and require persistent storage for proactive flows. Reference: [proactive-endpoints.md](./references/proactive-endpoints.md).
- `environment-secrets`: Configure production environment settings and keep secrets out of source control. Reference: [environment-secrets.md](./references/environment-secrets.md).
- `safe-error-handling`: Add safe agent error handling with generic user messages and server-side diagnostics. Reference: [safe-error-handling.md](./references/safe-error-handling.md).
- `header-propagation`: Propagate only approved outbound headers such as trace and correlation IDs. Reference: [header-propagation.md](./references/header-propagation.md).
- `attachments`: Handle attachments defensively with downloader setup and validation. Reference: [attachments.md](./references/attachments.md).
- `observability`: Enable SDK diagnostics and OpenTelemetry tracing. Reference: [observability.md](./references/observability.md).
- `transcripts`: Store transcripts only when required and document retention, access, and disclosure expectations. Reference: [transcripts.md](./references/transcripts.md).

## Feature Rules
- Do not combine Blob turn-state storage and Cosmos turn-state storage; ask the user to choose one.
- Prefer `persistent-storage` with Blob Storage when a selected feature needs durable state and the user has not chosen a store.
- `proactive-endpoints` requires persistent storage.
- `transcripts` can use Blob transcript storage even when Cosmos DB is used for turn state.
- `payload-limit` usually means owning the Express setup instead of relying only on `startServer` defaults.

## Workflow
Ask the user if they want to create a new sample or adapt an existing one, unless the user already specified it.
If the user called the skill without specifying a task: either create or adapt/update an existing sample, ask the user which one they want to do.

Important: a user can ask questions and reason about the production features during any step of the workflow, the skill will answer and provide guidance to reach a common understanding of the production features and their implementation, but the skill should not lose track of the workflow and the selected features, and should not let the user get lost in the reasoning process.

Important: make sure to validate the sample builds and runs after implementing the selected features, and before reporting the final results to the user. 

### Create a new sample
1. Ask the user to specify the name of the new sample, unless the user already specified it.
  1. Alongside asking the name, show suggestions for a name based on the context provided by the user.
2. Ask the user to select which production features they want to implement in their new sample, unless the user already specified them.
  1. If the selected features require or it is recommended to implement other features, suggest those features to the user.
3. Read [required-baseline.md](./references/required-baseline.md) and the references for the selected features.
4. Create a new sample with the required baseline plus the selected features.

Example of a required baseline for a new sample:
When creating a new sample, start with a minimal empty-agent shape and add only the features the user selects or mentions.
Usually related files are:
- `src/` folder with TypeScript code
  - `index.ts` with the agent and message handler
  - `agent.ts` with the agent and adapter setup
- `package.json` with dependencies and scripts
- `tsconfig.json` with TypeScript settings
- `.env` with environment variable settings
- `README.md` with setup, run, and production notes

#### Report
List the selected features in the new sample, and if the user wants to implement additional features, suggest which ones are missing or unclear and how to implement them.

Show the following numbered list:
```md
1. `{{ list item }}`: {{ file reference and line number if applicable }} {{ note about the implementation, recommendation, etc. , if applicable }}
```
  
### Adapt an existing sample
1. Inspect the existing sample to determine which production features are already implemented.
2. Ask the user which additional features they want to implement or modify.
  1. If the selected features require or it is recommended to implement other features, suggest those features to the user.
3. Read [required-baseline.md](./references/required-baseline.md) and the references for detected or selected features.
4. Update the sample with the required baseline plus the selected features.

If more than one sample is detected in the repo, ask these kind of questions (adapt as needed):
- If user specified a sample, use that one. If another sample is detected, ask if the user wants to adapt that one as well.
- Adapt both samples or just one?
- Which sample?

#### Report
List the detected, missing, and unclear features in the existing sample. If the user wants to implement additional features, suggest which ones are missing or unclear and how to implement them.

Show the following numbered list:
```md
1. `{{ list item }}`: {{ file reference and line number if applicable }} {{ note about the implementation, recommendation, etc. , if applicable }}
```

## References
- SDK repo: https://github.com/microsoft/Agents/blob/main/README.md
- SDK samples: https://github.com/microsoft/Agents/blob/main/samples/README.md
