## Secure proactive and custom endpoints

When to use it: Use this for endpoints outside the normal channel message path, such as `/api/proactive/*`, administrative operations, callbacks, scheduled jobs, or any endpoint called by another service.

Why it matters: `authorizeJWT` validates the token. Your application should still decide which callers are allowed to perform the operation.

Add an allow-list after `authorizeJWT`:

```ts
import express, { Request, Response } from 'express'
import { authorizeJWT, loadAuthConfigFromEnv } from '@microsoft/agents-hosting'
import type { JwtPayload } from 'jsonwebtoken'

const authConfig = loadAuthConfigFromEnv()
const app = express()
app.use(express.json())

const allowedCallers = (process.env.ALLOWED_CALLERS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

function requireAllowedCaller (req: Request, res: Response, next: express.NextFunction) {
  const user = (req as any).user as JwtPayload | undefined
  const callerId = user?.appid ?? user?.azp ?? user?.sub ?? ''

  if (!allowedCallers.includes(callerId)) {
    res.status(403).json({ error: 'Caller is not allowed.' })
    return
  }

  next()
}

app.post(
  '/api/proactive/continue/:conversationId',
  authorizeJWT(authConfig),
  requireAllowedCaller,
  async (req, res) => {
    // Continue the conversation here.
  }
)
```

In production, fail startup when `ALLOWED_CALLERS` is empty for protected custom endpoints.

## Store proactive references securely

When to use it: Use this when a sample sends proactive messages, creates conversations, or stores conversation references for later use.

Why it matters: A conversation reference includes routing information such as `serviceUrl` and conversation IDs. Treat it as sensitive operational state and store it in the same persistent, access-controlled storage used by the agent.

Configure proactive storage explicitly:

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { BlobsStorage } from '@microsoft/agents-hosting-storage-blob'

const storage = new BlobsStorage(
  process.env.BLOB_CONTAINER_ID!,
  process.env.BLOB_STORAGE_CONNECTION_STRING!
)

const agent = new AgentApplication<TurnState>({
  storage,
  proactive: { storage },
})
```

Prefer storing references captured from real inbound turns. Use default Teams service endpoints from builders only as a fallback when no real `serviceUrl` has been observed for the target conversation, and keep custom proactive HTTP endpoints protected with JWT plus caller allow-lists.

If proactive messages require user authorization handlers, keep the default `failOnUnsignedInConnections` behavior so `continueConversation()` fails when a required user connection has not signed in. Set it to `false` only for flows where skipped or partially authorized proactive work is explicitly acceptable.
