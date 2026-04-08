---
name: agents-sdk-debugging
description: Use when attempting to resolve problems with an agent built using Microsoft Agents SDK @microsoft/agents-hosting and related packages.
---

# Debugging Agents Built with Microsoft Agents SDK

## Overview

There are a lot of things that can go wrong when building an agent, from authentication issues to coding errors. This guide will help you systematically identify and resolve common problems with agents built using the Microsoft Agents SDK.

## Checklist

You MUST create a task for each of these items and complete them in order:

1. Make sure the code builds successfully.
2. Make sure the application starts and runs without crashing.
3. Make sure the application opens a port and listens for incoming requests.
4. Validate the bot's credentials
5. Use the Agents Playground to test the agent locally without needing to deploy to Azure.



### 1. Validate bot credentials (clientId / clientSecret / tenantId)

This tests that your Entra app registration credentials are correct and can authenticate with the Bot Framework. A successful response includes `access_token`; an error response includes `error` and `error_description`.

```bash
curl -s -X POST \
  "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" \
  -d "grant_type=client_credentials\
&client_id=$clientId\
&client_secret=$clientSecret\
&scope=https://api.botframework.com/.default" \
  | jq '{token_type, expires_in, error, error_description}'
```

Common errors:
- `AADSTS700016` — `clientId` not found in tenant (wrong ID or wrong tenant)
- `AADSTS7000215` — invalid `clientSecret` (expired or incorrect)
- `AADSTS90002` — `tenantId` not found

### 2. Validate the agent is running and reachable

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3978/api/messages \
  -H "Content-Type: application/json" \
  -d '{}'
```

- `401` — agent is running; JWT auth rejected the empty request (expected — means auth is working)
- `000` or connection refused — agent is not running or wrong port
- `200` — agent is running with auth disabled (local dev with blank `clientId`)

### 3. Validate an OAuth connection name

OAuth connection names (used by `graph_connectionName`) can only be tested end-to-end through a real sign-in flow. Use the Azure portal:

**Azure Portal → Your Bot Resource → Settings → OAuth Connection Settings → [your connection] → Test Connection**

This confirms the connection name matches, the OAuth app has the right scopes, and the redirect URI is configured correctly.

## Local Testing with Agents Playground

The Agents Playground lets you test your agent locally without deploying to Azure or configuring a Bot resource. It acts as a mock connector service and channel client.

**Install:**
```bash
npm install -g agentsplayground
```
