// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Extensions.MSTeams;

namespace Microsoft.Teams.Samples.BotAttachments;

[TeamsExtension]
internal partial class BotAttachmentsTeamsExtensionMarker : AgentApplication
{
    public BotAttachmentsTeamsExtensionMarker(AgentApplicationOptions options) : base(options)
    {
    }
}
