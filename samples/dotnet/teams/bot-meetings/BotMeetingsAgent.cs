// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Azure.Identity;
using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Builder.State;
using Microsoft.Agents.Core.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Graph;
using Microsoft.Teams.Cards;

namespace BotMeetings;

public partial class BotMeetingsAgent : AgentApplication
{
    private readonly GraphServiceClient? _graphClient;

    public BotMeetingsAgent(AgentApplicationOptions options, IConfiguration configuration)
        : base(options)
    {
        _graphClient = CreateGraphClient(configuration.GetSection("Graph"));

        OnActivity(ActivityTypes.Event, OnMeetingEventAsync);
    }

    private Task OnMeetingEventAsync(ITurnContext turnContext, ITurnState turnState, CancellationToken cancellationToken)
    {
        JsonElement payload = ReadPayload(turnContext.Activity?.Value);
        return turnContext.Activity?.Name switch
        {
            "application/vnd.microsoft.meetingStart" => SendMeetingStartCardAsync(turnContext, payload, cancellationToken),
            "application/vnd.microsoft.meetingEnd" => SendMeetingEndCardAsync(turnContext, payload, cancellationToken),
            "application/vnd.microsoft.meetingParticipantJoin" => SendMeetingParticipantJoinCardAsync(turnContext, payload, cancellationToken),
            "application/vnd.microsoft.meetingParticipantLeave" => SendMeetingParticipantLeaveCardAsync(turnContext, payload, cancellationToken),
            _ => Task.CompletedTask
        };
    }

    private Task SendMeetingParticipantJoinCardAsync(
        ITurnContext turnContext,
        JsonElement payload,
        CancellationToken cancellationToken)
    {
        JsonElement? member = GetFirstMember(payload);
        string aadObjectId = GetString(member, "user", "aadObjectId") ?? string.Empty;
        if (string.IsNullOrEmpty(aadObjectId))
        {
            return Task.CompletedTask;
        }

        string memberName = GetString(member, "user", "name") ?? string.Empty;
        string role = GetString(member, "meeting", "role") ?? "a participant";
        return SendCardAsync(
            turnContext,
            new AdaptiveCard
            {
                Schema = "http://adaptivecards.io/schemas/adaptive-card.json",
                Body =
                [
                    new TextBlock($"{memberName} has joined the meeting as {role}.")
                    {
                        Wrap = true,
                        Weight = TextWeight.Bolder
                    }
                ]
            },
            cancellationToken);
    }

    private Task SendMeetingStartCardAsync(
        ITurnContext turnContext,
        JsonElement payload,
        CancellationToken cancellationToken)
    {
        string title = GetString(payload, "title") ?? string.Empty;
        string startTime = GetString(payload, "scheduledStartTime")
            ?? GetString(payload, "startTime")
            ?? string.Empty;
        string joinUrl = GetString(payload, "joinUrl") ?? string.Empty;

        return SendCardAsync(
            turnContext,
            new AdaptiveCard
            {
                Schema = "http://adaptivecards.io/schemas/adaptive-card.json",
                Body =
                [
                    new TextBlock("The meeting has started.")
                    {
                        Wrap = true,
                        Weight = TextWeight.Bolder,
                        Size = TextSize.Large
                    },
                    new TextBlock($"**Title:** {title}")
                    {
                        Wrap = true
                    },
                    new TextBlock($"**Start Time:** {startTime}")
                    {
                        Wrap = true
                    }
                ],
                Actions =
                [
                    new OpenUrlAction(joinUrl)
                    {
                        Title = "Join Meeting"
                    }
                ]
            },
            cancellationToken);
    }

    private async Task SendMeetingEndCardAsync(
        ITurnContext turnContext,
        JsonElement payload,
        CancellationToken cancellationToken)
    {
        string userId = GetString(payload, "organizer", "aadObjectId")
            ?? GetString(payload, "organizer", "user", "aadObjectId")
            ?? string.Empty;
        string joinUrl = GetString(payload, "joinUrl") ?? string.Empty;
        string graphMeetingId = GetString(payload, "msGraphResourceId") ?? string.Empty;
        if (string.IsNullOrEmpty(graphMeetingId) &&
            _graphClient is not null &&
            !string.IsNullOrEmpty(joinUrl) &&
            !string.IsNullOrEmpty(userId))
        {
            graphMeetingId = await GetOnlineMeetingIdAsync(userId, joinUrl, cancellationToken);
        }

        await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);

        string transcript = string.Empty;
        if (_graphClient is not null &&
            !string.IsNullOrEmpty(graphMeetingId) &&
            !string.IsNullOrEmpty(userId))
        {
            string vttTranscript = await GetMeetingTranscriptAsync(
                graphMeetingId,
                userId,
                cancellationToken);
            if (!string.IsNullOrEmpty(vttTranscript))
            {
                transcript = ParseVtt(vttTranscript);
            }
        }

        var body = new List<CardElement>
        {
            new TextBlock("The meeting has ended.")
            {
                Wrap = true,
                Weight = TextWeight.Bolder,
                Size = TextSize.Large
            },
            new TextBlock($"**End Time:** {GetString(payload, "scheduledEndTime") ?? GetString(payload, "endTime") ?? string.Empty}")
            {
                Wrap = true
            },
            new TextBlock("**Transcript:**")
            {
                Wrap = true,
                Weight = TextWeight.Bolder
            }
        };

        if (!string.IsNullOrEmpty(transcript))
        {
            foreach (string line in transcript.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                if (!string.IsNullOrWhiteSpace(line))
                {
                    body.Add(new TextBlock(line) { Wrap = true });
                }
            }
        }
        else
        {
            body.Add(new TextBlock("Transcript not available for this meeting.") { Wrap = true });
        }

        await SendCardAsync(
            turnContext,
            new AdaptiveCard
            {
                Schema = "http://adaptivecards.io/schemas/adaptive-card.json",
                Body = body
            },
            cancellationToken);
    }

    private Task SendMeetingParticipantLeaveCardAsync(
        ITurnContext turnContext,
        JsonElement payload,
        CancellationToken cancellationToken)
    {
        JsonElement? member = GetFirstMember(payload);
        string memberName = GetString(member, "user", "name") ?? string.Empty;
        if (string.IsNullOrEmpty(memberName))
        {
            return Task.CompletedTask;
        }

        return SendCardAsync(
            turnContext,
            new AdaptiveCard
            {
                Schema = "http://adaptivecards.io/schemas/adaptive-card.json",
                Body =
                [
                    new TextBlock($"{memberName} has left the meeting.")
                    {
                        Wrap = true,
                        Weight = TextWeight.Bolder
                    }
                ]
            },
            cancellationToken);
    }

    private async Task<string> GetOnlineMeetingIdAsync(
        string userId,
        string joinWebUrl,
        CancellationToken cancellationToken)
    {
        string escapedJoinUrl = joinWebUrl.Replace("'", "''", StringComparison.Ordinal);

        var meetings = await _graphClient!.Users[userId]
            .OnlineMeetings
            .GetAsync(
                requestConfiguration: config => config.QueryParameters.Filter = $"JoinWebUrl eq '{escapedJoinUrl}'",
                cancellationToken: cancellationToken);

        return meetings?.Value?.FirstOrDefault()?.Id ?? string.Empty;
    }

    private async Task<string> GetMeetingTranscriptAsync(
        string meetingResourceId,
        string userId,
        CancellationToken cancellationToken)
    {
        var transcriptsMetadata = await _graphClient!.Users[userId]
            .OnlineMeetings[meetingResourceId]
            .Transcripts
            .GetAsync(cancellationToken: cancellationToken);

        if (transcriptsMetadata?.Value is not { Count: > 0 })
        {
            return string.Empty;
        }

        string? transcriptId = transcriptsMetadata.Value
            .OrderByDescending(transcript => transcript.CreatedDateTime)
            .FirstOrDefault()
            ?.Id;
        if (transcriptId is null)
        {
            return string.Empty;
        }

        Stream? content = await _graphClient.Users[userId]
            .OnlineMeetings[meetingResourceId]
            .Transcripts[transcriptId]
            .Content
            .GetAsync(
                requestConfiguration: config => config.Headers.Add("Accept", "text/vtt"),
                cancellationToken: cancellationToken);
        if (content is null)
        {
            return string.Empty;
        }

        await using (content)
        using (var reader = new StreamReader(content))
        {
            return await reader.ReadToEndAsync(cancellationToken);
        }
    }

    private static string ParseVtt(string vtt)
    {
        var lines = new List<string>();
        foreach (string line in vtt.Split('\n'))
        {
            string trimmedLine = line.Trim();
            if (string.IsNullOrEmpty(trimmedLine) ||
                trimmedLine.StartsWith("WEBVTT", StringComparison.Ordinal) ||
                trimmedLine.Contains("-->", StringComparison.Ordinal))
            {
                continue;
            }

            string processedLine = Regex.Replace(trimmedLine, @"<v ([^>]+)>", "$1: ");
            processedLine = Regex.Replace(processedLine, @"<[^>]+>", string.Empty).Trim();
            if (!string.IsNullOrEmpty(processedLine))
            {
                lines.Add(processedLine);
            }
        }

        return string.Join("\n", lines);
    }

    private static Task SendCardAsync(
        ITurnContext turnContext,
        AdaptiveCard card,
        CancellationToken cancellationToken)
        => turnContext.SendActivityAsync(
            MessageFactory.Attachment(new Attachment
            {
                ContentType = ContentTypes.AdaptiveCard,
                Content = card
            }),
            cancellationToken);

    private static GraphServiceClient? CreateGraphClient(IConfiguration graphConfiguration)
    {
        string tenantId = graphConfiguration["TenantId"] ?? string.Empty;
        string clientId = graphConfiguration["ClientId"] ?? string.Empty;
        string clientSecret = graphConfiguration["ClientSecret"] ?? string.Empty;

        if (!IsConfigured(tenantId) || !IsConfigured(clientId) || !IsConfigured(clientSecret))
        {
            return null;
        }

        try
        {
            var credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
            return new GraphServiceClient(credential, ["https://graph.microsoft.com/.default"]);
        }
        catch (ArgumentException)
        {
            return null;
        }
    }

    private static bool IsConfigured(string value)
        => !string.IsNullOrWhiteSpace(value) &&
           !value.Contains("{{", StringComparison.Ordinal) &&
           !value.StartsWith("<", StringComparison.Ordinal);

    private static JsonElement ReadPayload(object? payload)
    {
        if (payload is JsonElement element)
        {
            return element;
        }

        if (payload is null)
        {
            return JsonDocument.Parse("{}").RootElement;
        }

        return JsonDocument.Parse(JsonSerializer.Serialize(payload)).RootElement;
    }

    private static JsonElement? GetFirstMember(JsonElement payload)
    {
        if (!TryGetProperty(payload, "members", out JsonElement members) ||
            members.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        foreach (JsonElement item in members.EnumerateArray())
        {
            return item;
        }

        return null;
    }

    private static string? GetString(JsonElement? payload, params string[] path)
    {
        if (payload is null)
        {
            return null;
        }

        JsonElement current = payload.Value;
        foreach (string segment in path)
        {
            if (!TryGetProperty(current, segment, out JsonElement child))
            {
                return null;
            }

            current = child;
        }

        return current.ToString();
    }

    private static bool TryGetProperty(JsonElement payload, string propertyName, out JsonElement value)
    {
        foreach (JsonProperty property in payload.EnumerateObject())
        {
            if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }
}
