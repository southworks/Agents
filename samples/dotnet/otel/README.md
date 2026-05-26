# OpenTelemetry Agent

This is a sample of a simple Agent that is hosted on an ASP.NET Core web service. The sample demonstrates how to configure [OpenTelemetry](https://opentelemetry.io/) (OTel) for distributed tracing, metrics, and logging in a Microsoft 365 Agents SDK application.

Telemetry is exported via OTLP to a configurable endpoint. The sample instruments ASP.NET Core, `HttpClient`, the .NET runtime, the Agents SDK telemetry source, and shared sample-level route telemetry for welcome and message handling.

## Prerequisites

- [.NET](https://dotnet.microsoft.com/en-us/download/dotnet/8.0) version 8.0
- [dev tunnel](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started?tabs=windows) (for local development)
- [Docker](https://www.docker.com/) (to run the Aspire Dashboard for local telemetry visualization)

## Start the Telemetry Dashboard

Run the [.NET Aspire Dashboard](https://learn.microsoft.com/dotnet/aspire/fundamentals/dashboard/standalone) as a standalone OTLP collector and visualization UI:

```bash
docker run --rm -it -p 18888:18888 -p 4317:18889 --name aspire-dashboard mcr.microsoft.com/dotnet/aspire-dashboard:9.2
```

- **Port 18888** — Dashboard UI. Open `http://localhost:18888` in a browser to view traces, metrics, and logs.
- **Port 4317** — OTLP gRPC endpoint (default for the agent to export telemetry).

## Local Setup

### Configure Azure Bot Service

1. Create an Azure Bot with one of these authentication types
   - [SingleTenant, Client Secret](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-create-single-secret)
   - [SingleTenant, Federated Credentials](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-create-federated-credentials) 
   - [User Assigned Managed Identity](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-create-managed-identity)

   > **IMPORTANT:** If you want to run your agent locally via devtunnels, the only support auth type is ClientSecrets and Certificates

1. Update `appsettings.json` with your bot credentials:
   ```json
   "Connections": {
     "ServiceConnection": {
       "Settings": {
         "ClientId": "{{ClientId}}",
         "ClientSecret": "{{ClientSecret}}",
         "AuthorityEndpoint": "https://login.microsoftonline.com/{{TenantId}}"
       }
     }
   }
   ```

1. Running the Agent
   1. Running the Agent locally
      - Requires a tunneling tool to allow for local development and debugging should you wish to do local development whilst connected to a external client such as Microsoft Teams.
      - **For ClientSecret or Certificate authentication types only.**  Federated Credentials and Managed Identity will not work via a tunnel to a local agent and must be deployed to an App Service or container.
      
      1. Run `dev tunnels`. Please follow [Create and host a dev tunnel](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started?tabs=windows) and host the tunnel with anonymous user access command as shown below:

         ```bash
         devtunnel host -p 3978 --allow-anonymous
         ```

      1. On the Azure Bot, select **Settings**, then **Configuration**, and update the **Messaging endpoint** to `{tunnel-url}/api/messages`

      1. Start the Agent in Visual Studio

   1. Deploy Agent code to Azure
      1. VS Publish works well for this.  But any tools used to deploy a web application will also work.
      1. On the Azure Bot, select **Settings**, then **Configuration**, and update the **Messaging endpoint** to `https://{{appServiceDomain}}/api/messages`


## Accessing the Agent

### Using the Agent in Agents Playground

1. Install the Agents Playground if it is not already available:

   ```bash
   winget install agentsplayground
   ```

1. Start the agent locally in Visual Studio.

1. Open a command prompt and start Agents Playground:

   ```bash
   agentsplayground -e http://localhost:3978/api/messages
   ```

1. Interact with the agent through the browser.

### Optional: Using the Agent in WebChat

1. Go to your Azure Bot Service resource in the Azure Portal and select **Test in WebChat**

## OpenTelemetry Configuration

The `AgentOtelExtension.cs` file provides the `ConfigureOtelProviders` extension method, which wires up all three OTel signals before the app starts:

```csharp
builder.ConfigureOtelProviders();
```

By default, telemetry is exported to `http://localhost:4317` via OTLP gRPC. To change the endpoint, set the `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable or configure it in `appsettings.json`.

The sample uses `OTelAgent` as the service name and adds shared custom route telemetry so the three language samples expose the same base spans, metrics, and app logs.

### What is instrumented

| Signal | Sources |
|--------|---------|
| **Traces** | ASP.NET Core requests, `HttpClient` outgoing calls, Agents SDK (`AgentsTelemetry.ActivitySource`), and shared sample spans (`agent.welcome_message`, `agent.message_handler`) |
| **Metrics** | ASP.NET Core, `HttpClient`, .NET runtime, Agents SDK meter, `agent.routes.executed.count`, `agent.message.processing.duration` |
| **Logs** | All `ILogger` log records forwarded to the OTLP log exporter, including shared app logs emitted from the sample handlers |

## Viewing Telemetry

1. Open the Aspire Dashboard at `http://localhost:18888`.
1. Send a few messages to the agent.
1. In the dashboard, verify the shared telemetry contract:
   - **Traces** — `agent.welcome_message` and `agent.message_handler`
   - **Metrics** — `agent.routes.executed.count` and `agent.message.processing.duration`
   - **Logs** — welcome and message handling log records emitted by the sample

### Azure Monitor (Application Insights)

The sample includes a commented-out block for exporting to Azure Monitor. To enable it, add the `Azure.Monitor.OpenTelemetry.AspNetCore` NuGet package and uncomment the following in `AgentOtelExtension.cs`:

```csharp
if (!string.IsNullOrEmpty(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
{
    builder.Services.AddOpenTelemetry()
       .UseAzureMonitor();
}
```

Then set `APPLICATIONINSIGHTS_CONNECTION_STRING` to your Application Insights connection string.

## Enabling JWT Token Validation

The sample `appsettings.json` ships with JWT token validation enabled. If you want to relax validation for local debugging, set `TokenValidation.Enabled` to `false` and restore it before testing through Azure Bot channels:

```json
"TokenValidation": {
  "Enabled": true,
  "Audiences": [
    "{{ClientId}}"
  ],
  "TenantId": "{{TenantId}}"
}
```

## Further reading

- [OpenTelemetry .NET](https://opentelemetry.io/docs/languages/net/)
- [.NET Aspire Dashboard (standalone)](https://learn.microsoft.com/dotnet/aspire/fundamentals/dashboard/standalone)
- [Microsoft 365 Agents SDK](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/)
