## Limit request payload size

When to use it: Add body limits when you host the Express app yourself or expose custom JSON endpoints.

Why it matters: Samples often use `express.json()` with defaults. Production services should reject unexpectedly large payloads before they reach the adapter or sample logic.

Use an explicit limit on the Express JSON parser:

```ts
import express from 'express'
import { authorizeJWT, loadAuthConfigFromEnv } from '@microsoft/agents-hosting'

const authConfig = loadAuthConfigFromEnv()
const app = express()

app.use(express.json({ limit: '1mb' }))

app.post('/api/messages', authorizeJWT(authConfig), async (req, res) => {
  // Process the activity here.
})
```

If you need body parser settings that `startServer` does not expose, own the Express setup and use `createAgentRequestHandler` or `CloudAdapter.process` directly.
