# Bot Attachments - .NET (C#)

This sample demonstrates how to send and receive file attachments in Microsoft Teams using an agent built with the Microsoft 365 Agents SDK. When a user sends a file, the agent downloads it, requests consent via a File Consent Card, and uploads the file to the user's OneDrive upon acceptance.

![Bot Attachments](bot-attachments.gif)

## Features

- **File receive** - Accepts files sent by the user in a Teams chat.
- **File Consent Card** - Requests user permission before uploading to OneDrive.
- **OneDrive upload** - On acceptance, uploads the file and sends a File Info Card with a link via proactive messaging.
- **Decline handling** - Notifies the user gracefully when consent is declined.
- **Proactive completion** - A hosted background service performs the upload and proactively sends the result without retaining the incoming turn context.

It targets the [Microsoft 365 Agents SDK for .NET](https://learn.microsoft.com/microsoft-365/agents-sdk/) (`Microsoft.Agents.*`).

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Dev tunnels](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started)
- An Azure Bot configured with the Microsoft Teams channel

## Configuration

Agent credentials use token validation configuration with Azure Bot Service integration. Configure `TokenValidation` and `Connections.ServiceConnection` sections in [appsettings.json](appsettings.json):

```json
{
  "TokenValidation": {
    "Audiences": [ "{{ClientId}}" ],
    "TenantId": "{{TenantId}}"
  },
  "Connections": {
    "ServiceConnection": {
      "Settings": {
        "AuthType": "ClientSecret",
        "AuthorityEndpoint": "https://login.microsoftonline.com/{{TenantId}}",
        "ClientId": "{{ClientId}}",
        "ClientSecret": null,
        "Scopes": [ "https://api.botframework.com/.default" ]
      }
    }
  }
}
```

For local development with environment overrides, create an ignored `appsettings.Development.json`:

```json
{
  "TokenValidation": {
    "Audiences": [ "<client-id>" ],
    "TenantId": "<tenant-id>"
  },
  "Connections": {
    "ServiceConnection": {
      "Settings": {
        "AuthorityEndpoint": "https://login.microsoftonline.com/<tenant-id>",
        "ClientId": "<client-id>",
        "ClientSecret": "<client-secret>"
      }
    }
  }
}
```

This sample uses the Teams file consent flow and does not require Microsoft Graph application permissions.

## Run the sample

1. Navigate to this directory:
   ```bash
   cd samples/dotnet/teams/bot-attachments
   ```

2. Start a persistent public dev tunnel for port 3978:

   ```bash
   devtunnel create -a my-tunnel
   devtunnel port create -p 3978 my-tunnel
   devtunnel host my-tunnel
   ```

3. Set the Azure Bot messaging endpoint to `https://<your-tunnel-domain>/api/messages`.

4. Restore dependencies and run:

   ```bash
   dotnet run --launch-profile BotAttachments
   ```

The agent listens on `http://localhost:3978`.

## App package and testing in Teams

Ensure the Azure Bot has the Microsoft Teams channel enabled. Create or update a Teams app package whose bot ID is your client ID and whose bot scopes include `personal`, then upload the package as a custom app in Teams. No resource-specific consent or Graph permissions are required.

Attach a file or image in a personal chat with the agent. The agent downloads the attachment and displays a file consent card. Accepting the card starts the OneDrive upload; declining it removes the pending file.

## Next Steps

Refer to the [main README](../../README.md) for instructions on how to:
- Deploy and test your agent in Microsoft Teams
- Configure Teams app manifest and credentials
