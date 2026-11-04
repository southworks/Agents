# Targeted Messages Agent for Microsoft Teams

This Python agent demonstrates private targeted messages in Teams channels and group chats. It lets people create reminders for themselves or a mentioned teammate, list or cancel reminders, and receive scheduled reminder cards privately. Reminder data is held in memory and is lost when the agent restarts.

## Requirements and setup

- Python 3.11 or later
- An Azure Bot with a configured service connection

Copy `.env.TEMPLATE` to `.env` and set the service connection client ID, client secret, and tenant ID. Use the same client ID for `AAD_APP_CLIENT_ID` and `CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTID`; it identifies the Teams app and Azure Bot. Configure the Azure Bot messaging endpoint as `{public-agent-url}/api/messages`.

Install the requirements and run the host:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m src.main
```

The local server listens on port 3978 by default. Set `PORT` to change it. `GET /` is a credential-free readiness endpoint; message requests at `POST /api/messages` remain protected by the SDK authorization middleware.

## Agent commands

Use the slash command surface or mention the agent in a channel or group chat. Reminder commands support seconds, minutes, and hours:

- `remind me in 5 minutes to check email` creates a self-reminder.
- `remind @John in 10 minutes review PR` targets a mentioned teammate.
- `my-reminders` lists reminders you created or that are assigned to you.
- `cancel-reminder [id]` cancels a reminder you created or that is assigned to you.
- `reminder-help` displays usage; `help` is an alias.
- `add-reaction [type]` and `remove-reaction [type]` add or remove a reaction on a message. Use these by mentioning the agent; targeted slash messages cannot apply reactions.

The reminder agent also provides suggested actions and Adaptive Card buttons to cancel, dismiss, or snooze a delivered reminder for five minutes. These buttons are card actions, not commands.
