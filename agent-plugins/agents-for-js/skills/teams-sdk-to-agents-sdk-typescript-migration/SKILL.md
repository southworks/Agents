---
name: teams-sdk-to-agents-sdk-typescript-migration
description: Migrate a JavaScript or TypeScript application using the Microsoft Teams SDK App runtime to Microsoft 365 Agents SDK while preserving its Teams behaviors. Use for Teams SDK migrations, including automated sample synchronization; use the separate Bot Framework migration skill for botbuilder applications.
---

# Teams SDK to Agents SDK for TypeScript

Read the source handlers, startup, dependencies, environment configuration and
manifest before changing code. Inventory each command, invoke payload, response,
state transition and external call. Preserve command precedence and visibility,
including targeted versus public messages. A similarly named .NET API is not
evidence that a TypeScript API exists.

## Packages and runtime

Use stable published Agents SDK packages compatible with one another:

- `@microsoft/agents-activity`: Activity models and protocol helpers.
- `@microsoft/agents-hosting`: AgentApplication, state and storage.
- `@microsoft/agents-hosting-express`: Express startup.
- `@microsoft/agents-hosting-extensions-msteams`: Teams routes and client helpers.

Remove `@microsoft/teams.apps` and its runtime plugins. Supporting Teams card/model
packages can remain when used intentionally; the MSTeams extension itself depends
on `@microsoft/teams.api`. Do not globally ban every package in that namespace.
Avoid the deprecated `agents-hosting-extensions-teams` package for new migrations.

For synchronization, `context.migration.packages` is the frozen exact npm package
map. Declare those versions directly. The minimum is a floor, not the version to
copy. Do not translate NuGet floating versions into npm syntax. Node 24 is the
sync runtime; inspect published engines for customer applications.

## Application and route mapping

Create an `AgentApplication` with explicit storage. Keep an importable agent
factory separate from `startServer` so contracts can run routes without opening a
port. For Teams-specific behavior, construct `TeamsAgentExtension(app)` and call
`app.registerExtension(teams, callback)`; the callback is required. Inspect the
selected package's declarations and implementation before choosing signatures.

Typical mappings in the 1.9 SDK family:

| Teams SDK behavior | Agents SDK surface |
| --- | --- |
| `app.message` / `app.on('message')` | `app.onMessage` or `onTeamsMessage` |
| `context.send` | `context.sendActivity(Activity.fromObject(...))` for structured activity; strings can be sent directly |
| `card.action` | `app.adaptiveCards.actionExecute`; inspect the callback's action object and its `data` |
| `message.ext.query` | `teams.messageExtensions.onQuery(commandId, handler)` |
| `message.ext.query-link` | `teams.messageExtensions.onQueryLink` |
| `dialog.open` / `dialog.submit` | `teams.taskModules.onFetch` / `onSubmit` |
| `file.consent` | `teams.fileConsent` acceptance/decline routes |
| Meeting events | `teams.meetings` registration helpers |
| Feedback invoke | `onTeamsFeedbackLoop` |
| Teams API calls | `TeamsTurnContext.client` or `teams.getTeamsClient(context)` |
| Targeted activity | `TeamsTurnContext.sendTargetedActivity` and Activity targeting helpers |

Route ranks sort from smallest to largest. `RouteRank.Unspecified` is very large;
a numeric fallback such as 1000 can unexpectedly run first. Use explicit ranks
for competing routes and `RouteRank.Last` for catch-alls. Preserve existing
if/else precedence and unknown-command handling.

Ordinary `onActivity` routes receive a base `TurnContext`. Construct
`new TeamsTurnContext(context)` before using `.client`; a TypeScript cast does
not add the runtime getter. Message selectors that inspect text can skip
attachment-only messages; use `onActivity('message', ...)` when those are valid.

In 1.9.1, Activity parsing drops extra nested account/reaction fields, including
Teams' `recipient.isTargeted` and `reaction.user`. Preserve required values at
the HTTP boundary before parsing, using retained entities. Use
`Activity.makeTargetedActivity()` with a group conversation and explicit recipient
for private group delivery; preserve `targetedMessageInfo` for slash prompt preview.
Clone a captured conversation reference before normalizing its ID: the SDK can
retain references to incoming activity objects.

An Agents `Activity` is a class, not a plain Teams SDK message object. Convert
structured replies with `Activity.fromObject`, or use MessageFactory/CardFactory.
Keep Adaptive Card execute responses, task responses and compose-extension
responses in their proper envelopes. Sending a normal reply does not replace the
required invoke response.

## State, external services and assets

Keep sample-local state scoped to the application factory. MemoryStorage and
in-memory reminders are development examples and reset at process restart.
Preserve timer cancellation, upload cleanup and targeted delivery semantics.
Inject external services where useful so tests can cover behavior without
Graph, file-transfer, Wikipedia or Teams credentials.

Use the Agents connection configuration conventions instead of copying Teams
runtime authentication bootstrap. Acquire Graph tokens through the configured
connection/authorization helpers. Never put secrets into manifests or test data.
Keep static task-module pages available under the URLs returned by handlers.

After code migration, use the standalone `teams-app-manifest` skill to reconcile
source, README/help and actual manifest JSON. Check exact command IDs/titles,
surfaces, task pages, file support and link domains. Do not assume schema validity
proves feature coverage.
Meeting event handlers also require manifest RSC grants and `webApplicationInfo`;
participant events require bot registration subscriptions in the Teams Developer
Portal. Verify these prerequisites separately from injected route tests.

## Automated sample synchronization

Follow the caller's read-only planning and frozen-plan protocol. Only edit the
selected sample; protected contracts and automation are outside its write scope.
Use `validate_sample` for dependency preparation, compilation, contracts, manifest
and startup checks. The trusted tool generates the lockfile with npm; do not
invent lockfile integrity values or request unrestricted shell access.

Keep package scripts explicit and finite, with no recursive npm install hooks.
Export `createAgent` from `src/agent.ts`, start the server in `src/index.ts`, and
compile strict NodeNext source from `src` to `dist`. Retain a credential-free
health endpoint. Report unsupported behavior as a concrete blocker with source
evidence rather than omitting it or claiming the migration passed.

Official source: <https://github.com/microsoft/Agents-for-js>. The installed
selected package types and source are authoritative for the run's API surface.
