# Agent Attachments

This sample receives a file shared with a Teams agent, asks for file consent, and
uploads the file to the supplied OneDrive upload URL.

## Prerequisites

- Python 3.11.14
- An Azure Bot registration with its application ID, client secret, and tenant ID
- A public HTTPS endpoint for Teams to reach the agent

## Setup

1. Create a virtual environment and activate it:

   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate
   ```

2. Install the pinned dependencies:

   ```bash
   python -m pip install --require-hashes -r requirements.lock
   ```

   The lock is generated for Linux x86_64 with CPython 3.11.14. Resolve and
   validate a new lock for other operating systems or Python patch versions.

3. Copy `.env.TEMPLATE` to `.env` and set the service connection client ID,
   client secret, and tenant ID from the Azure Bot registration.

4. Configure the Azure Bot messaging endpoint as
   `https://<your-public-host>/api/messages`.

5. Start the agent:

   ```bash
   python -m src.main
   ```

The agent listens on port 3978 by default. Set `PORT` to use another port.
`GET /` is a credential-free readiness endpoint; message processing remains
protected by SDK authorization.

## File transfer behavior

Send a supported Teams file attachment to the agent. The agent downloads the
attachment, requests permission using a file-consent card, and uploads the
original bytes only after acceptance. Declining discards the pending bytes.
Teams supplies a signed upload URL; the sample does not store or log it.

For local development, expose port 3978 through a secure development tunnel and
use its HTTPS URL as the Azure Bot messaging endpoint.
