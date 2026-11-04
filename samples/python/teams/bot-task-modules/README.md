# Task Modules with a Python Agent

This sample demonstrates Adaptive Card, custom URL, and multi-step task modules in Microsoft Teams using the Microsoft 365 Agents SDK for Python.

## Prerequisites

- Python 3.11
- pip
- An Azure Bot registration and a publicly reachable HTTPS endpoint for the custom form when testing in Teams

## Configuration

Copy `.env.TEMPLATE` to `.env` and set the service connection client ID, client secret, and tenant ID from your Azure Bot registration. Set `BOT_ENDPOINT` to the public HTTPS origin that serves this agent; the custom form dialog uses that origin for both its URL and fallback URL. The manifest's `your-agent-domain.example` domain is a sample placeholder and must be replaced with the host used for your deployment.

## Run the agent

Install the exact pinned dependencies and start the agent:

```bash
pip install -r requirements.txt
python main.py
```

The agent listens on port `3978` by default. Configure the Azure Bot messaging endpoint as `https://<your-agent-domain>/api/messages`, then package and sideload the manifest for your Teams environment.

Send the agent a message to receive a card with three dialog actions:

- **Adaptive Card** opens a text input and returns the submitted text.
- **Custom Form** serves the name and email form at `/customform`.
- **Multi-step Form** collects a name, carries it into the email step, then confirms both values.

The task-module actions are card buttons, not slash or mention commands.
