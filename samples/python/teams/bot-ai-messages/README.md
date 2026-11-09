# Teams AI messages agent (Python)

This sample demonstrates AI-generated labels, sensitivity metadata, citations, and
custom feedback in Microsoft Teams agent messages.

## Prerequisites

- CPython 3.11.14 on Linux x86_64 (the `requirements.lock` was resolved and
  validated for this runtime and platform)
- An Azure Bot registration with its application ID, tenant ID, and client secret
- A Teams development environment and an HTTPS tunnel for local testing

## Configure and run

From this directory, create and activate a fresh virtual environment, then install
the platform-specific, hash-locked dependencies:

```sh
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --require-hashes -r requirements.lock
cp .env.TEMPLATE .env
```

The wheel lock is specific to Linux x86_64 with CPython 3.11.14; it is not a
universal lock for other runtimes or platforms. For another runtime or platform,
resolve dependencies through a trusted process and validate the resulting lock
there before installing it.

Set `CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTID`,
`CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTSECRET`, and
`CONNECTIONS__SERVICE_CONNECTION__SETTINGS__TENANTID` in `.env` to the Azure Bot
credentials. Never commit `.env` or its secrets.

Expose port 3978 using an HTTPS development tunnel and set the Azure Bot messaging
endpoint to `https://YOUR_HOST/api/messages`. Start the agent with:

```sh
python -m src.main
```

The root URL is a credential-free readiness check; Teams message requests remain
protected by the Agents SDK authentication middleware. Package `manifest/manifest.json`
with `manifest/color.png` and `manifest/outline.png` at the package root before
uploading the app to Teams. Replace the sample app ID placeholder before packaging.

## Try the agent

Send a message containing `label`, `sensitivity`, `feedback`, or `citation` to see
the corresponding message metadata. If a message contains multiple keywords, the
first matching feature in that order is used: label, sensitivity, feedback, citation.
These are ordinary message keywords, not slash or mention commands; the manifest
therefore has no `bots[].commandLists` entries. The feedback card accepts a reaction
and optional text. Other messages receive help listing these keywords.

`src.agent.create_agent()` exposes an importable application factory, and importing
it does not start a server or contact Teams. Local protected checks inject offline
connection and adapter dependencies while dispatching through the Agents SDK.
