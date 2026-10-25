// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Extensions.MSTeams;

namespace BotAiMessages;

[TeamsExtension]
internal partial class BotAiMessagesTeamsExtensionMarker(AgentApplicationOptions options) : AgentApplication(options);
