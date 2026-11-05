# Targeted Messages Agent

This Python sample demonstrates targeted messaging in Microsoft Teams. It creates private reminders in channels and group chats, delivers them only to the intended recipient, and provides reminder cards for cancellation, snoozing, and dismissal. Reactions can be added or removed from regular messages.

## Requirements

- Python 3.11.14
- An Azure Bot registration and Teams connection for live messaging

## Run locally

From this directory, create and activate a virtual environment, then install the validated lock:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --require-hashes -r requirements.lock
cp env.TEMPLATE .env
```

Set the connection client ID, secret, and tenant ID in `.env`, then run:

```bash
python -m src.main
```

The agent listens on `http://localhost:3978`. Configure the Azure Bot messaging endpoint as `https://<your-tunnel>/api/messages` when connecting a Teams tenant. `GET /` is a readiness endpoint; message requests remain protected by the Agents SDK authorization middleware.

The lock file is resolved for Python 3.11.14 on Linux. Other operating systems require a separately resolved and validated lock.

## Commands

| Surface | Command | Purpose |
| --- | --- | --- |
| Mention | `remind` | Set a reminder for yourself or a mentioned person, for example `remind me in 5 minutes to check email`. |
| Mention | `cancel-reminder` | Cancel a reminder by ID. |
| Mention | `add-reaction` | Add a reaction to a regular message. |
| Mention | `remove-reaction` | Remove a reaction from a regular message. |
| Slash | `my-reminders` | List active reminders created by or assigned to you. |
| Slash or mention | `reminder-help` | Show help and suggested actions. |

Card actions let the recipient cancel, dismiss, or snooze a delivered reminder. Reminders are held in memory and are lost when the process restarts.
