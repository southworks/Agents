## Add safe error handling

When to use it: Add an error handler to any sample that can call external services, use storage, process files, run long operations, or handle user input.

Why it matters: Users need a clean failure message. Operators need enough server-side detail to diagnose the issue. Do not send stack traces, tokens, connection strings, or downstream response bodies to users.

Use `agent.onError`:

```ts
import { AgentApplication, TurnContext, TurnState } from '@microsoft/agents-hosting'

const agent = new AgentApplication<TurnState>()

agent.onError(async (context: TurnContext, error: Error) => {
  console.error('Unhandled turn error:', error)
  await context.sendActivity('Sorry, something went wrong while processing your request.')
})
```

Use structured logging in production and include correlation IDs from the hosting platform when available.
