## Add health and readiness endpoints

When to use it: Add health endpoints when the sample runs in a container, App Service, Azure Container Apps, Kubernetes, or any environment with load balancers and probes.

Why it matters: Health probes tell the platform whether the process is alive. Readiness checks tell the platform whether dependencies such as storage are reachable before traffic is routed to the instance.

Use `beforeListen` when `startServer` owns the Express app:

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { BlobsStorage } from '@microsoft/agents-hosting-storage-blob'

const storage = new BlobsStorage(
  process.env.BLOB_CONTAINER_ID!,
  process.env.BLOB_STORAGE_CONNECTION_STRING!
)
const agent = new AgentApplication<TurnState>({ storage })

startServer(agent, {
  beforeListen: (app) => {
    app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok' })
    })

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

Keep health routes lightweight and avoid exposing secrets, tenant IDs, tokens, or detailed exception messages.
