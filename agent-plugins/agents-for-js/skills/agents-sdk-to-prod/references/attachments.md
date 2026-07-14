## Handle attachments defensively

When to use it: Add attachment downloaders only for samples that actually need to inspect or persist user files.

Why it matters: Attachments can contain malware, sensitive data, very large payloads, or URLs that should not be fetched by your service. Production agents should validate content type, size, source, scan policy, and retention before processing files.

Use the SDK downloaders for channel-aware downloads:

```ts
import {
  AgentApplication,
  InputFile,
  M365AttachmentDownloader,
  TurnContext,
  TurnState,
} from '@microsoft/agents-hosting'

const agent = new AgentApplication<TurnState>({
  fileDownloaders: [
    new M365AttachmentDownloader('inputFiles'),
  ],
})
```

Then validate the downloaded files inside the handler that uses them. In this example, the downloader stores files in `state.inputFiles` before the message handler runs, and the handler rejects files that do not match the sample's allow-list:

```ts
agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const files = state.getValue<InputFile[]>('inputFiles') ?? []
  const allowedTypes = new Set(['image/png', 'image/jpeg', 'application/pdf'])
  const maxBytes = 5 * 1024 * 1024

  for (const file of files) {
    if (!allowedTypes.has(file.contentType) || file.content.length > maxBytes) {
      await context.sendActivity('One or more attachments could not be processed.')
      return
    }
  }

  // Process the validated files here.
})
```

Do not download arbitrary user-provided URLs outside the channel attachment flow unless you have an allow-list, network egress controls, timeout limits, and malware scanning in place.
