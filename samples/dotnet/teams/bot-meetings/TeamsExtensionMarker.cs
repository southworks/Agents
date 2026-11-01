// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Extensions.MSTeams;

namespace BotMeetings;

[TeamsExtension]
public partial class TeamsExtensionMarker : AgentApplication
{
    public TeamsExtensionMarker(AgentApplicationOptions options)
        : base(options)
    {
    }
}
