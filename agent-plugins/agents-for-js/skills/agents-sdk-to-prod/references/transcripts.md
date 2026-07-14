## Store transcripts intentionally

When to use it: Enable transcript storage when you need support diagnostics, audit trails, supervised review, or compliance retention.

Why it matters: Transcripts can contain user content, personal data, attachments, and business-sensitive information. Storing them increases operational value and privacy responsibility.

Use Blob-backed transcripts instead of local files:

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { BlobsStorage, BlobsTranscriptStore } from '@microsoft/agents-hosting-storage-blob'

const storage = new BlobsStorage(
  process.env.BLOB_CONTAINER_ID!,
  process.env.BLOB_STORAGE_CONNECTION_STRING!
)
const transcriptLogger = new BlobsTranscriptStore(
  process.env.BLOB_STORAGE_CONNECTION_STRING!,
  process.env.BLOB_CONTAINER_ID!
)

const agent = new AgentApplication<TurnState>({
  storage,
  transcriptLogger,
})
```

Before enabling transcripts in production, define retention, deletion, encryption, access control, and customer disclosure requirements.
