# Production-ready sample hardening

Agents SDK samples are intentionally small so that each feature is easy to see. Before adapting a sample for production, add the operational and security pieces that a short sample usually leaves out. This guide shows those pieces as additive changes that can be applied to any JavaScript or TypeScript sample.

The examples use the public APIs already exposed by the SDK. The same hardening model also applies conceptually to other SDK languages.

> [!IMPORTANT]
> Production readiness depends on your hosting environment, data classification, compliance requirements, and channel configuration. Treat this guide as the baseline checklist for an Agents SDK sample, then apply your organization's security review.

## Production baseline checklist

- Use persistent state instead of `MemoryStorage`.
- Require JWT authentication on the agent messages endpoint and any custom HTTP endpoint that changes data or sends messages.
- Enable `CloudAdapterOptions__validateServiceUrl=true` so activity `serviceUrl` values must match the authenticated caller's `serviceurl` claim.
- Restrict `connectionsMap` entries to expected service URLs and audiences where possible.
- Require user authorization handlers before calling downstream APIs on behalf of a user.
- Add rate limiting on public HTTP endpoints.
- Limit JSON request body size when you own the Express app.
- Add unauthenticated health endpoints and readiness checks for dependencies.
- Store secrets in your hosting platform's secret store, not in source control.
- Set `NODE_ENV=production` so missing required auth settings fail at startup.
- Log server-side failures, but send generic user-facing error messages.
- Enable SDK debug namespaces or OpenTelemetry exporters for production diagnostics.
- Propagate only approved outbound headers.
- Download attachments only when the scenario needs them, and validate type, size, and source.
- Store transcripts only when there is a product, support, audit, or compliance requirement.

## Minimal hardened sample shape

This combines the main pieces without adding sample-specific behavior:

```ts
import {
  AgentApplication,
  CloudAdapter,
  loadAuthConfigFromEnv,
  TurnContext,
  TurnState,
} from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { BlobsStorage } from '@microsoft/agents-hosting-storage-blob'

const storage = new BlobsStorage(
  process.env.BLOB_CONTAINER_ID!,
  process.env.BLOB_STORAGE_CONNECTION_STRING!
)
const adapter = new CloudAdapter(
  loadAuthConfigFromEnv(),
  undefined,
  undefined,
  { validateServiceUrl: true }
)

const agent = new AgentApplication<TurnState>({
  adapter,
  storage,
  proactive: { storage },
  startTypingTimer: true,
})

agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const counter = state.getValue<number>('conversation.counter') ?? 0
  await context.sendActivity(`[${counter}] You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter + 1)
})

agent.onError(async (context, error) => {
  console.error('Unhandled turn error:', error)
  await context.sendActivity('Sorry, something went wrong while processing your request.')
})

startServer(agent, {
  rateLimitOptions: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
  beforeListen: (app) => {
    app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }))
    app.get('/ready', async (_req, res) => {
      try {
        await storage.read(['readiness'])
        res.status(200).json({ status: 'ready' })
      } catch {
        res.status(503).json({ status: 'not ready' })
      }
    })
  },
})
```

Use this shape as the starting point, then add sample-specific routes, auth handlers, proactive messaging, transcripts, and downstream API clients only when the scenario requires them.
