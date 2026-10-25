// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Extensions.MSTeams;

namespace BotMessageExtensions;

[TeamsExtension]
public partial class TeamsExtensionMarker(AgentApplicationOptions options) : AgentApplication(options)
{
}
