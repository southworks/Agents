// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Builder.State;
using Microsoft.Agents.Core.Models;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Threading;

namespace Otel;

public class MyAgent : AgentApplication
{
    private readonly ILogger<MyAgent> _logger;

    public MyAgent(AgentApplicationOptions options, ILogger<MyAgent> logger) : base(options)
    {
        _logger = logger;
        OnConversationUpdate(ConversationUpdateEvents.MembersAdded, WelcomeMessageAsync);
        OnActivity(ActivityTypes.Message, OnMessageAsync, rank: RouteRank.Last);
    }

    private async Task WelcomeMessageAsync(ITurnContext turnContext, ITurnState turnState, CancellationToken cancellationToken)
    {
        using System.Diagnostics.Activity? activity = SampleTelemetry.ActivitySource.StartActivity("agent.welcome_message");

        activity?.SetTag("conversation.id", turnContext.Activity.Conversation?.Id ?? "unknown");
        activity?.SetTag("channel.id", turnContext.Activity.ChannelId ?? "unknown");
        activity?.SetTag("members.added.count", turnContext.Activity.MembersAdded.Count);

        foreach (ChannelAccount member in turnContext.Activity.MembersAdded)
        {
            if (member.Id != turnContext.Activity.Recipient.Id)
            {
                activity?.AddEvent(new ActivityEvent("member.added", tags: new ActivityTagsCollection
                {
                    { "member.id", member.Id },
                    { "member.name", member.Name }
                }));

                await turnContext.SendActivityAsync(MessageFactory.Text("Hello and Welcome!"), cancellationToken);

                SampleTelemetry.RouteExecutionCounter.Add(1, new KeyValuePair<string, object?>[]
                {
                    new("route.type", "welcome_message"),
                    new("conversation.id", turnContext.Activity.Conversation?.Id ?? "unknown")
                });

                _logger.LogInformation(
                    "Welcome message sent for conversation {ConversationId}",
                    turnContext.Activity.Conversation?.Id ?? "unknown");
            }
        }
    }

    private async Task OnMessageAsync(ITurnContext turnContext, ITurnState turnState, CancellationToken cancellationToken)
    {
        using System.Diagnostics.Activity? activity = SampleTelemetry.ActivitySource.StartActivity("agent.message_handler");
        Stopwatch stopwatch = Stopwatch.StartNew();

        activity?.SetTag("conversation.id", turnContext.Activity.Conversation?.Id ?? "unknown");
        activity?.SetTag("channel.id", turnContext.Activity.ChannelId ?? "unknown");
        activity?.SetTag("message.text.length", turnContext.Activity.Text?.Length ?? 0);
        activity?.SetTag("user.id", turnContext.Activity.From?.Id ?? "unknown");
        activity?.AddEvent(new ActivityEvent("message.received", tags: new ActivityTagsCollection
        {
            { "message.id", turnContext.Activity.Id },
            { "message.text", turnContext.Activity.Text },
            { "user.id", turnContext.Activity.From?.Id },
            { "channel.id", turnContext.Activity.ChannelId }
        }));

        try
        {
            await turnContext.SendActivityAsync($"You said: {turnContext.Activity.Text}", cancellationToken: cancellationToken);

            activity?.AddEvent(new ActivityEvent("response.sent"));

            SampleTelemetry.RouteExecutionCounter.Add(1, new KeyValuePair<string, object?>[]
            {
                new("route.type", "message_handler"),
                new("conversation.id", turnContext.Activity.Conversation?.Id ?? "unknown")
            });

            _logger.LogInformation(
                "Message handled for conversation {ConversationId}",
                turnContext.Activity.Conversation?.Id ?? "unknown");
        }
        catch (Exception ex)
        {
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            activity?.AddEvent(new ActivityEvent("exception", tags: new ActivityTagsCollection
            {
                { "exception.type", ex.GetType().FullName },
                { "exception.message", ex.Message }
            }));
            _logger.LogError(ex, "Error handling message for conversation {ConversationId}", turnContext.Activity.Conversation?.Id ?? "unknown");
            throw;
        }
        finally
        {
            stopwatch.Stop();
            SampleTelemetry.MessageProcessingDuration.Record(stopwatch.Elapsed.TotalMilliseconds, new KeyValuePair<string, object?>[]
            {
                new("conversation.id", turnContext.Activity.Conversation?.Id ?? "unknown"),
                new("channel.id", turnContext.Activity.ChannelId ?? "unknown")
            });
        }
    }
}