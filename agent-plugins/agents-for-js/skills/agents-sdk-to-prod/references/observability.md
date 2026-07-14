## Enable observability

When to use it: Enable observability before load testing and keep it on in production with appropriate sampling and retention.

Why it matters: Production agents need traces and logs for authentication failures, storage latency, channel requests, connector calls, and turn processing.

For local diagnostics, enable SDK debug namespaces:

```sh
DEBUG=agents:authorization:*,agents:jwt-middleware:*,agents:app:*,agents:state:* node index.js
```

For production, wire OpenTelemetry before the agent starts:

```ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const sdk = new NodeSDK({
  serviceName: 'my-agent-service',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  }),
})

sdk.start()
```

The Agents SDK emits spans and logs from its instrumented components when OpenTelemetry is configured. Use your observability backend to alert on high error rates, auth failures, storage failures, and dependency latency.
