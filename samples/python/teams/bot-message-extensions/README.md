# Agent Message Extensions Sample

This sample uses the Microsoft 365 Agents SDK to search Wikipedia from the Teams
compose area and preview Wikipedia links.

## Features

- **Wikipedia Search** - Search Wikipedia from the compose area and add adaptive-card
  results with thumbnail previews to a message.
- **Link Unfurling** - Preview links from `en.wikipedia.org`.
- **Agent Messages** - Ask for `help` to learn about compose search, or send another
  message to receive an echo.

The `wikipediaSearch` message-extension command returns up to eight results. Empty
searches and unrecognized query commands return a no-results response. Selecting a
search result adds its card to the compose message.

## Prerequisites

- Python 3.11
- An Azure Bot configured with the Microsoft Teams channel
- A Microsoft 365 tenant where you can upload custom Teams apps
- `pip`

## Configure and run

Copy `.env.TEMPLATE` to `.env` and set the service connection client ID, client
secret, and tenant ID. Do not commit credentials.

Install dependencies and run the agent:

```sh
pip install -r requirements.txt
python -m src.main
```

The agent listens on `http://localhost:3978`. Expose the port through a development
tunnel and configure the Azure Bot messaging endpoint as
`https://YOUR_HOST/api/messages`.

## Teams app package

The `manifest` directory contains the app manifest and icons. Replace `${{BOT_ID}}`
with the Azure Bot client ID and `${{APP_NAME_SUFFIX}}` with an optional app-name
suffix, then package the three files in that directory into a ZIP archive. The
manifest declares the `Wikipedia Search` query command for the `compose` and
`commandBox` contexts and enables link unfurling for `en.wikipedia.org`. It does not
declare a slash or mention command.

Upload the package as a custom app in Teams. Open the app from the compose area's
Apps menu to search; paste an `en.wikipedia.org` URL to test link unfurling.
Wikipedia searches require outbound network access.
