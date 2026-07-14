## Replace volatile storage

When to use it: Use persistent storage for any sample that keeps user, conversation, proactive, auth, or dialog state across turns.

Why it matters: `MemoryStorage` is lost when the process restarts and is not shared across replicas. Production agents should use a durable backing service that works across restarts and multiple instances.

Use Azure Blob storage when you need straightforward durable state:

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { BlobsStorage } from '@microsoft/agents-hosting-storage-blob'

const storage = new BlobsStorage(
  process.env.BLOB_CONTAINER_ID!,
  process.env.BLOB_STORAGE_CONNECTION_STRING!
)

const agent = new AgentApplication<TurnState>({ storage })
```

Use Azure Cosmos DB when you need database-backed state for higher scale or stricter partitioned storage needs:

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import {
  CosmosDbPartitionedStorage,
  CosmosDbPartitionedStorageOptions,
} from '@microsoft/agents-hosting-storage-cosmos'

const cosmosOptions: CosmosDbPartitionedStorageOptions = {
  databaseId: process.env.COSMOS_DATABASE_ID!,
  containerId: process.env.COSMOS_CONTAINER_ID!,
  cosmosClientOptions: {
    endpoint: process.env.COSMOS_ENDPOINT!,
    key: process.env.COSMOS_KEY!,
  },
}

const storage = new CosmosDbPartitionedStorage(cosmosOptions)
const agent = new AgentApplication<TurnState>({ storage })
```

Fail startup in production if the required Blob or Cosmos storage settings are missing.
