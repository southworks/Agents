// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Extensions.MSTeams;

namespace Microsoft.Teams.Samples.BotTaskModules;

[TeamsExtension]
public partial class BotTaskModulesTeamsExtensionSentinel(AgentApplicationOptions options) : AgentApplication(options);
