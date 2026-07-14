## Propagate headers intentionally

When to use it: Configure header propagation when downstream connector calls or API clients need correlation IDs, trace context, or a product header.

Why it matters: Blindly forwarding inbound headers can leak `Authorization`, cookies, or tenant-specific data to services that should not receive them. The SDK lets you add or propagate only the headers you choose.

Use an allow-list:

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'

const agent = new AgentApplication<TurnState>({
  headerPropagation: (headers) => {
    headers.propagate(['traceparent', 'tracestate', 'x-correlation-id'])
    headers.add({ 'x-agent-component': 'orders-agent' })
  },
})
```

Do not propagate `authorization`, `cookie`, API keys, or user-provided headers unless the downstream service explicitly requires them and is authorized to receive them.
