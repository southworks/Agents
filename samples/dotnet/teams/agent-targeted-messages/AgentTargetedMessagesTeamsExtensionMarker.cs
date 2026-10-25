// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Extensions.MSTeams;

namespace AgentTargetedMessages;

[TeamsExtension]
public partial class AgentTargetedMessagesTeamsExtensionMarker(
    AgentApplicationOptions options) : AgentApplication(options);
