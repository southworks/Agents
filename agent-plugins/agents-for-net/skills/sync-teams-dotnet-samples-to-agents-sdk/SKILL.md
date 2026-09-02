---
name: teams-sdk-dotnet-samples-migration
description: Periodically migrate or refresh active .NET Teams SDK samples from OfficeDev/Microsoft-Teams-Samples samples/TeamsSDK into Microsoft/Agents samples/dotnet/teams. Skips Archived and configured sample names, creates AgentApplication subclasses, preserves sample behavior and assets, applies canonical Agents SDK sample files, and validates every migrated project.
---

# Teams SDK .NET Sample-Set Migration

## Purpose

Synchronize active .NET samples from:

`https://github.com/OfficeDev/Microsoft-Teams-Samples/tree/main/samples/TeamsSDK`

into:

`samples/dotnet/teams/<sample-name>`

Use the `teams-sdk-to-agents-sdk-dotnet-migration` skill for the detailed API, route, model, auth,
Graph, cards, meetings, message-extension, task-module, attachment, and proactive messaging mappings.
This skill controls the complete sample-set inventory, destination conventions, exclusions, and
validation.

## Default skip list

Do not migrate, update, build, or delete these samples unless the user explicitly overrides the list:

```text
bot-auth-quickstart
bot-proactive-message
bot-quickstart
```

Combine the default list with additional sample names supplied by the user. Match immediate source
directory names case-insensitively. A skipped sample already present in the destination remains
untouched unless the user explicitly requests removal.

`bot-proactive-message` remains skipped until the `teams-sdk-to-agents-sdk-dotnet-migration` skill
has complete, validated guidance for Agents SDK proactive messaging.

## Required workflow

1. Inventory immediate directories under upstream `samples/TeamsSDK`.
2. Exclude `Archived` and the effective skip list before reading or editing sample implementations.
3. Locate each remaining sample's .NET project. Handle projects with an additional nested project
   directory.
4. Compare the active inventory with `samples/dotnet/teams`.
5. Add new active samples and refresh existing active samples.
6. Do not remove a destination sample merely because it is skipped. Remove an obsolete destination
   only when the user explicitly requests exact synchronization.
7. Migrate only the .NET implementation. Do not copy Node.js or Python implementations.
8. After source migration is stable, use the standalone `teams-app-manifest` skill for every active
   destination sample. Generate a missing manifest, complete an existing manifest, or report
   `needs-input` without guessing.
9. Report migrated, added, updated, unchanged, skipped, removed, and failed samples separately.

## Migration requirements

- Preserve commands, matching behavior, responses, event handling, permissions, external client
  behavior, static pages, app-package files, cards, models, images, GIFs, and sample-specific settings.
- Target `net8.0`, enable nullable reference types, and disable implicit usings.
- Replace Teams SDK hosting with Agents SDK hosting.
- Create a dedicated subclass for every sample:

  ```csharp
  [TeamsExtension]
  public partial class SampleAgent(AgentApplicationOptions options) : AgentApplication(options)
  ```

- Move all inline `Program.cs` handlers to Teams route-attributed methods on that subclass.
- Route attributes from `Microsoft.Agents.Extensions.MSTeams.App` use `ITeamsTurnContext`. Base Agents
  SDK routes use their documented signatures; for example, `[ActionExecuteRoute]` uses
  `ITurnContext` and returns `AdaptiveCardInvokeResponse`.
- `Program.cs` contains only host, dependency injection, middleware, endpoints, and genuinely required
  sample-specific web endpoints or services.
- Do not add `builder.Services.AddHttpClient()` to any `Program.cs`. `AddAgentDefaults()` already
  registers the HTTP client services used by these samples.
- Do not implement the agent inline in `Program.cs`.
- Do not copy any `.gitignore`.
- Do not infer manifest scopes, domains, identity values, permissions, or Copilot exposure from a
  sample name. Require evidence and follow the `teams-app-manifest` skill.

## Teams app manifest

The `teams-app-manifest` skill owns all manifest decisions. Supply each migrated sample's source root,
original manifest if present, intended Teams scopes, distribution target, and placeholder convention.

- Keep the feature map, schema rules, snippets, and stop conditions in that shared skill.
- Store `manifest.json`, referenced icons, and `manifest-evidence.md` in the repository's canonical app
  package directory.
- Preserve verified original manifest behavior and user-facing metadata.
- Record configuration that must be completed in Teams Developer Portal, Entra, Azure Bot, or Graph.
- A missing product decision is a `needs-input` result, not permission to omit or invent a field.

## Package versions

Use the same repository version convention for all Agents SDK packages:

```xml
<PackageReference Include="Microsoft.Agents.Authentication.Msal" Version="1.7.*" />
<PackageReference Include="Microsoft.Agents.Hosting.AspNetCore" Version="1.7.*" />
<PackageReference Include="Microsoft.Agents.Extensions.MSTeams" Version="1.7.*" />
```

Preserve additional packages required by the source feature, including `Microsoft.Teams.Cards`,
Azure Identity, Microsoft Graph, or Azure OpenAI packages.

## Canonical Agents sample files

Treat the current files in `samples/dotnet/quickstart` as canonical. Always read them from the target
repository during each migration instead of relying on copied text in this skill.

### `AspNetExtensions.cs`

Copy the current quickstart `AspNetExtensions.cs`.

### `Program.cs`

Follow the current quickstart hosting and authentication registration:

```csharp
builder.AddAgentDefaults()
    .AddAgent<SampleAgent>()
    .AddAgentAuthorization(b => b.AddAgentAspNetAuthentication());
```

### `Properties/launchSettings.json`

Copy `samples/dotnet/quickstart/Properties/launchSettings.json` exactly and change only the profile
name. Preserve both HTTPS and HTTP URLs and the Development environment variable.

### `appsettings.json`

Start from the complete current `samples/dotnet/quickstart/appsettings.json`. Every migrated sample
must retain at least its complete structure and values, including:

- `TokenValidation`
- `AgentApplication`
- `Connections`
- `ConnectionsMap`
- `Logging`

Merge sample-specific settings without deleting or weakening the canonical baseline.

### `README.md`

Use `samples/dotnet/quickstart/README.md` as the structure and operational baseline:

- Retain the original Teams sample description and feature purpose.
- Match the overall voice, terminology, capitalization, heading style, paragraph density, numbered
  procedure style, code-fence style, and level of detail used by the current .NET sample READMEs,
  especially `samples/dotnet/quickstart/README.md`. A migrated README should read like a native
  repository sample, not like a separately authored migration guide.
- Rewrite SDK names, configuration, running, debugging, tunneling, Azure Bot, Teams, and testing
  instructions for Agents SDK.
- Under **Configure and run** or the equivalent configuration section, show `appsettings.json`
  changes as JSON, following the quickstart README. Do not replace the JSON example with environment
  variable names such as `TokenValidation__Audiences__0` or
  `Connections__ServiceConnection__Settings__ClientSecret`.
- Include the relevant JSON object structure from the sample's actual `appsettings.json`. At minimum,
  show the canonical token validation structure:

  ```json
  "TokenValidation": {
    "Audiences": [
      "{{ClientId}}"
    ],
    "TenantId": "{{TenantId}}"
  },
  ```

  Include additional JSON snippets for required sample-specific settings when applicable.
- Retain relevant original commands, permissions, setup instructions, limitations, app-package
  guidance, and feature-specific endpoints.
- Include relevant original images or GIFs when available.
- Under **Further reading**, always include:

  ```markdown
  - [Use the Teams extension for the Microsoft 365 Agents SDK](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/teams/teams-extension?pivots=dotnet)
  ```

- Do not replace the README with a thin migration note.

## Validation

For every non-skipped sample:

1. Confirm exactly one `[TeamsExtension] partial` `AgentApplication` subclass exists.
2. Confirm MSTeams route handlers use `ITeamsTurnContext`, while base Agents SDK routes use their
   documented delegate signatures and response types.
3. Confirm `Program.cs` has no inline activity handlers and no `authenticationConfigured` probing.
4. Confirm no `Program.cs` contains `builder.Services.AddHttpClient()`.
5. Confirm launch settings equal the current quickstart file except for the profile name.
6. Confirm appsettings contains every key path from the current quickstart appsettings plus required
   sample-specific settings.
7. Confirm each README configuration section uses JSON examples rather than environment-variable
   key syntax.
8. Confirm each README follows the current .NET sample style and includes the Teams extension link
   under **Further reading**.
9. Confirm no `.gitignore` exists.
10. Confirm all three Agents SDK packages use the same repository version convention.
11. Run `dotnet build` and require zero warnings and zero errors.
12. Run with the Development launch profile and verify `GET /` returns HTTP 200.
13. Verify feature-specific endpoints, such as a task-module custom form, when applicable.
14. Confirm every sample has a `teams-app-manifest` capability plan and no unexplained generated field.
15. Validate each rendered manifest against its pinned released schema.
16. Build and validate each Teams app package with the installed Microsoft 365 Agents Toolkit when available.
17. Report unresolved user decisions and external configuration separately from code or schema failures.

Do not declare the refresh complete until every non-skipped sample passes.
