# Manifest Evidence: agent-targeted-messages

## Execution Summary

Generated a Teams app manifest for the Microsoft 365 Agents SDK **agent-targeted-messages** sample using Agents SDK source analysis and Teams capability documentation.

## Capabilities Detected

### Bot Messaging

**Evidence**: 
- `[TeamsMessageRoute]` handlers in `AgentTargetedMessagesAgent.cs` process text commands
- Commands dispatched: "reminder-help", "remind", "my-reminders", "cancel-reminder", "add-reaction", "remove-reaction"
- Bot accepts messages in personal and team scopes

**Manifest Impact**: 
- Added `bots[0].scopes: ["personal", "team"]`
- Added command list with help text describing reminder and reaction management features
- Set `isNotificationOnly: false` (bot handles two-way conversation)

### Adaptive Card Actions

**Evidence**:
- `[ActionExecuteRoute("cancel_reminder")]`, `[ActionExecuteRoute("dismiss_reminder")]`, `[ActionExecuteRoute("snooze_reminder")]` in agent class
- Adaptive Card `ExecuteAction` verbs in card creation methods (`CreateConfirmationCard`, `CreateDeliveryCard`, `CreateSnoozeConfirmationCard`)
- Pattern: "execute" route attribute receives Adaptive Card action invoke

**Manifest Impact**: 
- Implicitly supported through bot scopes (no separate `actions` section required for execute actions)
- Verified via source routing attributes

### Targeted Messages (Proactive)

**Evidence**:
- `ReminderInfo` and `ReminderService` manage proactive message delivery
- `reminderService.AddAsync()` stores conversation context and sends targeted reminders
- Proactive send happens via `Proactive` helper in Agents SDK (stored in reminder context)
- Recipient filtering: "only you can see this" (targeted to specific user)

**Manifest Impact**:
- Requires `permissions: ["messageTeamMembers"]` for proactive messaging scope
- Implicit support through bot; no separate capability section

### Message Reactions

**Evidence**:
- `[MessageReactionsAddedRoute]` handler in agent receives `ReactionsAdded`
- Samples text message with reaction emoji detection
- `[MessageReactionsRemovedRoute]` placeholder

**Manifest Impact**:
- No explicit reactions capability section in Teams manifest v1.22
- Supported implicitly by bot scope when handler is present
- Documented in command list ("add-reaction", "remove-reaction")

## Required Values Resolved

| Value | Source | Confidence |
|-------|--------|-----------|
| `id` | `{{MicrosoftAppId}}` (placeholder) | High - Standard sample convention |
| `version` | "1.0.0" | High - New sample, first manifest |
| `packageName` | Derived from sample name | High - Follows Agents SDK convention |
| `scopes` | Source code routes | High - `[TeamsMessageRoute]` in personal & team |
| `permissions` | `messageTeamMembers` required for proactive send | High - Agents SDK Proactive pattern |
| `icons` | Verified in `appManifest/` directory | High - Files present |
| `accentColor` | Microsoft Teams default | High - Standard Teams brand color |

## Placeholder Convention

Used **double-braces** placeholders as specified in plan:
- `{{MicrosoftAppId}}` - App ID (from Azure Bot registration)
- `{{websiteUrl}}` - Website URL (local or deployment target)
- `{{privacyUrl}}` - Privacy statement URL
- `{{termsOfUseUrl}}` - Terms of use URL

## External Setup Not in Manifest

The following Teams development steps are outside manifest scope:

1. **Microsoft Entra App Registration** - Create a multi-tenant app registration with bot channels enabled
2. **Azure Bot Service** - Register the bot endpoint and configure Teams channel
3. **Manifest Upload** - Use Developer Portal to upload manifest and test in Teams
4. **Local Bot Emulator Testing** - Use Bot Framework Emulator with correct endpoint and credentials

See README.md for deployment instructions.

## Validation

✓ JSON schema validation passed (Teams v1.22 schema)  
✓ All declared capabilities have source evidence  
✓ Required bot properties present and valid  
✓ Icon files verified in `appManifest/` directory  
✓ No unsupported schema references  
✓ Permission scope valid for Teams messaging  

## Notes

- Sample uses double-braces convention for environment variable substitution
- Manifest targets **sample** distribution (not Store)
- `CommandList` helps Teams clients show command discovery UI
- Proactive messaging requires `messageTeamMembers` permission; sample uses targeted user filtering
- No meeting, tab, messaging extension, or connector capabilities detected
