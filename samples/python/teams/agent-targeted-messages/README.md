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
| Mention | `add-reaction` | Add a reaction to a regular message, or to the quoted/replied-to message. |
| Mention | `remove-reaction` | Remove a reaction from a regular message, or from the quoted/replied-to message. |
| Slash | `my-reminders` | List active reminders created by or assigned to you. |
| Slash or mention | `reminder-help` | Show help and suggested actions. |

Reminders can target yourself or a mentioned person and work in channels and group chats. Time expressions support seconds (`30 seconds`, `30 secs`, `30s`), minutes (`5 minutes`, `5 mins`, `5m`), and hours (`1 hour`, `2 hrs`, `1h`). The agent sends private targeted confirmations, reminder lists, and deliveries. Recipients can cancel a reminder from its confirmation card, or dismiss and snooze a delivered reminder. Reactions are limited to regular messages; reaction commands do not work through slash messages. Supported reaction types include `like`, `heart`, `1f440_eyes`, `2705_whiteheavycheckmark`, `launch`, and `1f4cc_pushpin`.

Reminders are held in memory and are lost when the process restarts.
