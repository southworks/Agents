// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Azure.Core;
using Microsoft.Agents.Authentication;
using BotAiMessages;
using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Builder.Testing;
using Microsoft.Agents.Core.Models;
using Microsoft.Agents.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Teams.Samples.BotCards;
using Xunit;

namespace TeamsSampleSync.ContractTests;

public class TeamsSampleContracts
{
    [Fact]
    public async Task BotCards_CardActions_ReturnsAdaptiveCardAsync()
    {
        await using AgentTestHost host = AgentTestHost.Create(builder =>
        {
            builder.Services.AddSingleton<IStorage, MemoryStorage>();
            builder.Services.AddHttpClient();
            builder.Services.AddTransient<IAgent>(services =>
                new BotCardsAgent(CreateOptions(services)));
        });
        host.Adapter.Conversation.ChannelId = Channels.Msteams;

        await host.CreateTestFlow()
            .Send("card actions")
            .AssertReply(activity =>
            {
                Assert.Single(activity.Attachments);
                Assert.Equal(ContentTypes.AdaptiveCard, activity.Attachments[0].ContentType);
            })
            .AssertNoMoreReplies()
            .StartTestAsync();
    }

    [Fact]
    public async Task BotAiMessages_UnknownText_ReturnsStableHelpAsync()
    {
        await using AgentTestHost host = AgentTestHost.Create(builder =>
        {
            builder.Services.AddSingleton<IStorage, MemoryStorage>();
            builder.Services.AddHttpClient();
            builder.Services.AddTransient<IAgent>(services =>
                new BotAiMessagesAgent(CreateOptions(services)));
        });
        host.Adapter.Conversation.ChannelId = Channels.Msteams;

        await host.CreateTestFlow()
            .Send("unknown")
            .AssertReplyContains("Welcome to the AI bot")
            .AssertNoMoreReplies()
            .StartTestAsync();
    }

    private static AgentApplicationOptions CreateOptions(IServiceProvider services)
    {
        IAccessTokenProvider tokenProvider = new TestTokenProvider();
        IConnections connections = new ConfigurationConnections(
            new Dictionary<string, IAccessTokenProvider> { ["test"] = tokenProvider },
            [],
            NullLogger<ConfigurationConnections>.Instance);

        return new AgentApplicationOptions(services.GetRequiredService<IStorage>())
        {
            Connections = connections,
            HttpClientFactory = services.GetRequiredService<IHttpClientFactory>()
        };
    }

    private sealed class TestTokenProvider : IAccessTokenProvider
    {
        public ImmutableConnectionSettings ConnectionSettings { get; } = new(new TestConnectionSettings());

        public Task<string> GetAccessTokenAsync(string resource, IList<string> scopes, bool forceRefresh)
            => Task.FromResult(string.Empty);

        public TokenCredential GetTokenCredential() => new TestCredential();
    }

    private sealed class TestConnectionSettings : ConnectionSettingsBase;

    private sealed class TestCredential : TokenCredential
    {
        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken)
            => new(string.Empty, DateTimeOffset.MaxValue);

        public override ValueTask<AccessToken> GetTokenAsync(
            TokenRequestContext requestContext,
            CancellationToken cancellationToken)
            => ValueTask.FromResult(new AccessToken(string.Empty, DateTimeOffset.MaxValue));
    }
}
