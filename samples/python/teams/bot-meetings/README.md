# Agent Meetings - Python

This sample demonstrates a Microsoft 365 agent that handles real-time meeting start/end and participant join/leave events in Teams, then retrieves and displays meeting transcripts through Microsoft Graph.

## Prerequisites

- Python 3.11 or later
- An Azure Bot registration and an Entra app registration with client credentials
- Teams Developer Portal access to enable meeting event subscriptions
- Microsoft Graph application access and consent for transcript retrieval

## Configure and run

1. Copy `env.TEMPLATE` to `.env` and set the service connection client ID, client secret, and tenant ID. These credentials are used for Azure Bot authentication and app-only Microsoft Graph access. Use that same client ID for the manifest's `${{AAD_APP_CLIENT_ID}}` placeholder.
2. Enable meeting start/end and participant join/leave event subscriptions for the app in Teams Developer Portal. Install the app in the meeting and configure the Azure Bot messaging endpoint as `https://YOUR_HOST/api/messages`.
3. Install dependencies and start the agent:

   ```bash
   python -m venv .venv
   . .venv/bin/activate
   pip install -r requirements.txt
   python -m src.main
   ```

The agent listens on port 3978 by default. `GET /` is a credential-free readiness check; message activities at `POST /api/messages` remain protected by the Agents SDK authorization middleware.

Transcript availability depends on the meeting's transcript settings and Microsoft Graph application permissions and consent. Configure the required Graph access and application access policy for the organizer in Entra and Teams; those permissions are separate from the Teams app manifest. Never commit credentials.

## Behavior

- Meeting start sends a card with the meeting title, start time, and join link.
- Meeting end sends the end time and transcript, or a clear unavailable message. Transcript retrieval waits 30 seconds, then retries up to three times with 10-second delays, choosing the newest VTT transcript.
- Participant join/leave events send a notification with the participant name and, for joins, their meeting role. Agent-only participants without an Entra object ID are ignored.

The app manifest and icons are in `manifest/`. Replace the documented app ID placeholder before packaging. The manifest declares no slash or mention commands.
