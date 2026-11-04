# Agent Attachments

This sample receives file attachments in Microsoft Teams, requests consent, and uploads accepted files to the user's OneDrive using the Microsoft 365 Agents SDK.

## Features

- Download files sent as Teams attachments.
- Request permission with a file consent card before uploading.
- Upload accepted files and return a file info card with a link.
- Handle declined consent and transfer failures.
- Limit downloads to 20 MiB and queue no more than five files awaiting consent or upload. Unanswered consent requests expire after 15 minutes.

## Prerequisites

- Python 3.11 or later
- An Azure Bot with the Microsoft Teams channel enabled
- Dev tunnels for local Teams testing

## Configure

Create an Azure Bot and copy its application ID, tenant ID, and client secret into a local `.env` file based on `.env.TEMPLATE`. Do not commit credentials.

For Teams installation, use an app package with the same bot application ID and the `personal` bot scope. File consent is supported in personal chats. This sample uses Teams file consent and does not require Microsoft Graph application permissions.

## Run

From this directory, install the dependencies and start the agent:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m src.main
```

The agent listens on `http://localhost:3978`. Expose port 3978 using a dev tunnel and set the Azure Bot messaging endpoint to `https://<your-tunnel-domain>/api/messages`.

In a personal chat, attach a file or image. The agent downloads it and displays a file consent card. Accepting starts the OneDrive upload; declining removes the pending file.

## Tests

From this directory, run `python -m unittest discover -s tests`.

## Further reading

- [Microsoft 365 Agents SDK](https://learn.microsoft.com/microsoft-365/agents-sdk/)
- [Teams extension for the Microsoft 365 Agents SDK](https://learn.microsoft.com/microsoft-365/agents-sdk/teams/teams-extension)
- [Send and receive files using bots](https://learn.microsoft.com/microsoftteams/platform/bots/how-to/bots-filesv4)
