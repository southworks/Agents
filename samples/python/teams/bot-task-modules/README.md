# Task Modules Agent - Python

This sample demonstrates three Microsoft Teams task-module interactions using the
Microsoft 365 Agents SDK: an Adaptive Card form, a hosted custom form, and a
two-step Adaptive Card form. The forms are opened from card buttons, not slash
commands.

## Prerequisites

- Python 3.11.14
- An Azure Bot registration with its client ID, secret, and tenant ID
- The Teams app manifest in `manifest/`
- A public Dev Tunnel when testing Teams dialogs, because Teams must reach the
  custom form URL

## Run locally

1. From this directory, create and activate a fresh virtual environment:

   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate
   ```

2. Install the platform-specific, hash-locked dependencies:

   ```bash
   python -m pip install --require-hashes -r requirements.lock
   ```

   The lock is generated for CPython 3.11.14 on Linux x86_64. Resolve and validate
   a new lock on another platform rather than assuming wheel hashes are portable.

3. Copy `.env.TEMPLATE` to `.env` and set the Azure Bot connection values.
   `BOT_ENDPOINT` must be the public HTTPS Dev Tunnel base URL when testing the
   custom form in Teams. Set `BOT_DOMAIN` to the hostname from `BOT_ENDPOINT`,
   without the scheme or path; replace `<<BOT_DOMAIN>>` in the
   manifest's `validDomains` before packaging.

4. Start the agent:

   ```bash
   python -m src.main
   ```

The host listens on port `3978` by default. `GET /` is a readiness endpoint;
authenticated activity requests are processed at `POST /api/messages`.

## Dialogs

- **Adaptive Card** collects multiline text and returns a submission acknowledgement.
- **Custom Form** serves `/customform` and collects a name and email address.
- **Multi-step Form** collects a name, carries it into the email step, then sends
  a personalized completion message.

Provision the Azure Bot messaging endpoint as
`https://<your-devtunnel-domain>/api/messages`. The sample manifest uses local
sample identity placeholders; replace them and the dialog domain with the
values for your app before packaging or distribution.
