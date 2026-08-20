# Production-ready JavaScript Agents

This guide moves a JavaScript Agents SDK sample toward a production deployment. It is a baseline, not a certification. Apply your organization’s security, privacy, reliability, and compliance reviews.

A Tier 3 production reference includes durable state, production identity, health checks, observability, tests, infrastructure as code, deployment guidance, rollback, and an operator runbook. The tier describes the evidence supplied by the sample. It does not certify a deployment for every organization or workload.

The companion [Web Chat production reference](../samples/nodejs/production-reference/README.md) proves one supported path: Azure App Service, managed identity, Blob state, and Web Chat. AI controls below apply when an agent invokes a model.

## How the artifacts work together

- Use this guide when you plan or review a production deployment, or when you add an optional feature. It defines the baseline and feature-specific controls.
- Use the [sample](../samples/nodejs/production-reference/README.md) when you need an executable example of one bounded deployment path. It is not a catalog of SDK features.
- Use the [AI skill](../agent-plugins/agents-for-js/skills/agents-sdk-to-prod/SKILL.md) when you want an AI coding agent to assess or harden a selected JavaScript scenario. The skill applies the guide and adds conditional controls only for features in that scenario.

## Define the deployment boundary

Record the supported channel, host, identities, data classes, dependencies, scale target, retention policy, and operational owner. Reject channels and callers outside this boundary. A sample that supports every channel by default has no meaningful production boundary.

For the reference path:

- Azure Bot Service Web Chat is the only channel.
- This user-assigned managed identity path is single-tenant.
- The JWT audience equals the deployed agent Entra application ID.
- The SDK requires `connectionsMap.serviceUrl=*` to select its default named connection. Require the exact audience in that map, then enforce the Web Chat service URL host in HTTP middleware.
- Enable the Cloud Adapter service URL check to bind that service URL to the authenticated caller claim.

## Required controls

### Identity and configuration

- Use environment configuration from App Service. Do not commit `.env` files.
- Fail startup when required production configuration is absent.
- Prefer managed identity, workload identity, or certificates. Use a client secret only where no secretless option exists; store it in Key Vault and rotate it.
- Use least privilege. Scope Blob roles to the storage resource and AI permissions to the workload identity that needs them.
- Keep health endpoints anonymous and non-sensitive. A readiness probe can use a fixed, non-user health record to verify a dependency. Protect every other endpoint that accepts messages, changes data, sends messages, or invokes a downstream API.

### State and concurrency

`MemoryStorage` is only for local development. Use a durable store for user, conversation, authorization, dialog, or proactive state.

- Use Blob or Cosmos based on workload needs. The reference uses Blob.
- Define state versioning before schema changes. Deploy readers that handle the old and new versions before writers.
- Handle optimistic concurrency conflicts with bounded, idempotent domain retries when a conversation can receive concurrent turns.
- Define state retention and deletion. Do not keep completed conversations indefinitely.
- Never silently fall back to memory state in Azure.

### HTTP reliability and traffic protection

- Use the SDK `startServer` helper when its default JSON parser, message pipeline, and shutdown behavior fit the deployment. Own the Express host when you need a payload limit, route-specific middleware, an error handler after the message route, or graceful HTTP drain.
- Set a JSON payload limit before the agent handler.
- Rate limit the message route at an authenticated edge such as Front Door or API Management. Do not use the Azure Bot connector IP as the end-user identity.
- Give downstream calls a timeout, bounded retry policy, exponential backoff with jitter, and a clear degraded behavior.
- Make externally visible side effects idempotent.
- Send generic error messages to users. Log only structured, redacted diagnostics.
- Drain HTTP traffic and flush telemetry on `SIGTERM` and `SIGINT`.

### Observability and operations

Collect traces, metrics, and structured logs for request rate, failures, latency, authentication rejection, state dependency health, and process restarts. Add model fallback signals when an agent invokes a model.

- Initialize the OpenTelemetry providers and exporters for the signals you need before Agents SDK components run. The SDK then emits its built-in instrumentation through the global OpenTelemetry APIs. Configure trace, metric, and log pipelines separately as applicable. Use an application bootstrap or Node preload when module import order could initialize the SDK first.
- Use `AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES` to disable unwanted built-in span categories. Supported values are `STORAGE`, `AUTHENTICATION`, `AUTHORIZATION`, and `DIALOGS`, separated by commas or spaces. Keep categories that support required operational signals.
- Add service name, deployment environment, and component attributes.
- Do not record raw activities, user identifiers, prompts, completions, access tokens, cookies, or connection strings by default.
- Set sampling and retention deliberately. Test redaction rather than assuming it.
- Publish alerts for readiness failure, elevated 5xx, auth rejection changes, dependency latency/failure, and restart loops. Add model fallback alerts when applicable.
- Maintain a runbook with rollback and data-retention actions.

## Conditional AI controls

AI controls are required when the agent invokes a model. They do not replace normal web-service controls.

### Treat model input as untrusted

User messages, retrieved documents, tool responses, and conversation history are data, not instructions. Keep security policy and tool constraints in trusted code. Do not grant instructions in user content authority over system policy.

- Bound input length and conversation history.
- Use a narrow system instruction that specifies the task and output contract.
- Do not interpolate secrets, credentials, hidden policy, or unnecessary personal data into prompts.
- Validate model output against a typed allow-list or schema before use.
- Use timeout, output token budget, and bounded retries. Define fallback behavior before deployment.
- Apply an input and output content-safety policy for the use case. Define when to block, retry, ask for clarification, or escalate to a person.
- Set request and deployment-level token and cost budgets. Alert before the budget is exhausted and define the degraded behavior.

### Tools and external actions

The reference sample has no tools. Before adding one:

- Allow-list each tool and validate typed input server-side.
- Give each tool only the identity permissions it needs and authorize every action server-side.
- Require explicit user confirmation for irreversible or high-impact actions.
- Enforce idempotency keys, rate limits, timeouts, and audit events.
- Never pass inbound authorization headers, cookies, or raw model output to a tool.

### Evaluation and safety operations

Build a versioned evaluation set that covers expected requests, prompt injection, data exfiltration attempts, malformed model output, tool misuse, unsafe content, and model outage. Run it before model, prompt, deployment, or tool changes. Track fallback rate, policy rejection, latency, token use, and cost without storing content by default.

## Conditional controls

Add these only if the feature exists:

Use long-running work only when an operation cannot reliably finish within the channel or host request deadline. Acknowledge the request, store durable job state, run the work outside the request, and provide authenticated status and cancellation. Set a deadline, make retries idempotent, and use proactive delivery only when the channel and caller are authorized.

| Feature | Required controls |
|---|---|
| Downstream user APIs | User authorization handler, minimum scopes, sign-out, no token logs |
| Proactive messaging | Durable conversation references, caller allow-list, idempotency |
| Attachments | Source/type/size checks, malware policy, egress controls, retention |
| Transcripts | Legal basis, disclosure, encryption, access review, retention/deletion |
| Retrieval | Source authorization, tenant boundary, provenance, injection resistance |

## Release checklist

- Build, lint, unit tests, HTTP integration tests, and deployment smoke test pass on supported Node versions.
- Startup fails for missing production identity, state, channel, or settings required by selected conditional features.
- Message endpoint rejects invalid JWTs, wrong audience, and non-Web-Chat service URLs.
- Liveness is `200`; readiness becomes `503` when state is unavailable.
- State survives restart. If concurrent turns can update the same state, conflict behavior is tested or the no-contention assumption is documented.
- When a model is used, timeout, invalid output, safety rejection, budget exhaustion, and outage use a bounded fallback.
- Telemetry tests prove sensitive data is excluded.
- IaC validates; rollback and operator actions are documented.

## Related material

- [Production reference sample](../samples/nodejs/production-reference/README.md)
- [Agents SDK storage documentation](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/storage)
- [Agents SDK JavaScript authentication](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-authentication-for-javascript)
- [Agents SDK telemetry package](https://github.com/microsoft/Agents-for-js/tree/main/packages/agents-telemetry)
- [Azure Bot managed identity setup](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-create-managed-identity)
- [Managed identities for App Service](https://learn.microsoft.com/en-us/azure/app-service/overview-managed-identity)
- [JavaScript production skill](../agent-plugins/agents-for-js/skills/agents-sdk-to-prod/SKILL.md)
