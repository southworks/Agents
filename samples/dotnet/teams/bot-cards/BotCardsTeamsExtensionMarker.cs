// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Extensions.MSTeams;

namespace Microsoft.Teams.Samples.BotCards;

[TeamsExtension]
public partial class BotCardsTeamsExtensionMarker(AgentApplicationOptions options) : AgentApplication(options);
