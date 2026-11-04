# Agent Cards Sample

This sample demonstrates Adaptive Card actions and visibility controls in Microsoft Teams with the Microsoft 365 Agents SDK and its Teams extension.

## Features

- **Card actions** - An Adaptive Card with `Action.OpenUrl`, a required name form, and nested `Action.ShowCard` actions.
- **Toggle visibility** - An Adaptive Card with `Action.ToggleVisibility` that shows or hides content.

Send either command as a message to the agent:

| Command | Description |
|---|---|
| `card actions` | Shows nested cards and a form for submitting a name. |
| `toggle visibility` | Shows a card with a visibility toggle. |

These are regular message commands, available as chat text or from the agent's mention suggestions; they are not slash commands. The card actions command takes precedence if a message contains both phrases. Unknown or empty messages receive help listing both commands.

## Prerequisites

- Python 3.11.14
- An Azure Bot with the Microsoft Teams channel enabled
- [Dev tunnels](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started) for local Teams testing

## Configure

Create an Azure Bot and copy `.env.TEMPLATE` to `.env`. Set the client ID, client secret, and tenant ID from the bot registration using the matching environment variable names. Do not commit credentials.

Set the Azure Bot messaging endpoint to `https://<your-tunnel-domain>/api/messages`. For local development, expose port 3978:

```sh
devtunnel host -p 3978 --allow-anonymous
```

Fill in the app and bot ID placeholders in `manifest/manifest.json`, then package that file with `color.png` and `outline.png` at the package root before uploading it to Teams.

## Run

From this directory, install the pinned dependencies and start the agent:

```sh
python -m venv .venv
. .venv/bin/activate
pip install --require-hashes -r requirements.lock
python -m src.main
```

The agent listens on `http://localhost:3978`. `GET /` is a credential-free readiness endpoint; configure all three service connection values for authenticated message handling at `POST /api/messages`.

## Further reading

- [Microsoft 365 Agents SDK](https://learn.microsoft.com/microsoft-365/agents-sdk/)
- [Teams extension for the Microsoft 365 Agents SDK](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/teams/teams-extension)
- [Adaptive Cards](https://adaptivecards.io/)
