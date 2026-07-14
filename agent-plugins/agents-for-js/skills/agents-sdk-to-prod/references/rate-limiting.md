## Add rate limiting

When to use it: Rate limit public endpoints, especially `/api/messages`, invoke endpoints, task module endpoints, and custom proactive endpoints.

Why it matters: Rate limiting reduces accidental overload and basic abuse. It does not replace authentication, authorization, bot service throttling, WAF rules, or channel-specific limits.

Use `startServer` options for the messages route:

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'

const agent = new AgentApplication<TurnState>()

startServer(agent, {
  rateLimitOptions: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
})
```

When you own the Express app, add `express-rate-limit` before `authorizeJWT`:

```ts
import express from 'express'
import rateLimit from 'express-rate-limit'
import { authorizeJWT, loadAuthConfigFromEnv } from '@microsoft/agents-hosting'

const authConfig = loadAuthConfigFromEnv()
const messagesRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})

const app = express()
app.use(express.json())
app.post('/api/messages', messagesRateLimiter, authorizeJWT(authConfig), async (req, res) => {
  // Process the activity here.
})
```

Tune limits for your channel traffic, expected concurrency, retry policy, and load testing results.
