## Require JWT authentication

When to use it: Require JWT authentication for `/api/messages` and any HTTP endpoint that continues a conversation, creates a conversation, updates state, calls a downstream API, or sends a proactive message.

Why it matters: In development, anonymous requests can be useful. In production, requests must prove they come from an expected channel or trusted caller. The SDK enforces `clientId` when `NODE_ENV=production`.

The shortest path is `startServer`, which loads auth configuration from the environment and applies JWT auth to the messages route:

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'

const agent = new AgentApplication<TurnState>()

startServer(agent)
```

Enable `CloudAdapter` service URL validation in production. This rejects authenticated activities whose `activity.serviceUrl` host does not match the caller's `serviceurl` claim. It helps prevent confused-deputy and SSRF-style attacks where a valid token is reused with a different service URL.

Use the environment variable when you rely on SDK-created adapters:

```env
CloudAdapterOptions__validateServiceUrl=true
CloudAdapterOptions__emitStackTrace=false
```

Or provide an adapter explicitly:

```ts
import {
  AgentApplication,
  CloudAdapter,
  loadAuthConfigFromEnv,
  TurnState,
} from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'

const adapter = new CloudAdapter(
  loadAuthConfigFromEnv(),
  undefined,
  undefined,
  { validateServiceUrl: true }
)

const agent = new AgentApplication<TurnState>({ adapter })
startServer(agent)
```

When you own the Express app, apply `authorizeJWT` to the protected route:

```ts
import express, { Response } from 'express'
import {
  AgentApplication,
  AuthConfiguration,
  CloudAdapter,
  Request,
  TurnState,
  authorizeJWT,
  loadAuthConfigFromEnv,
} from '@microsoft/agents-hosting'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const adapter = new CloudAdapter(authConfig)
const agent = new AgentApplication<TurnState>()
const app = express()

app.use(express.json())

app.post('/api/messages', authorizeJWT(authConfig), async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => {
    await agent.run(context)
  })
})
```

For framework adapters that can provide Express-compatible request and response objects, use `createAgentRequestHandler`:

```ts
import express from 'express'
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { createAgentRequestHandler } from '@microsoft/agents-hosting-express'

const agent = new AgentApplication<TurnState>()
const handler = createAgentRequestHandler(agent)
const app = express()

app.use(express.json())
app.post('/api/messages', handler)
```
