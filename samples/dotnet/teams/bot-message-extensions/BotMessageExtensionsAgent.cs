// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Builder.State;
using Microsoft.Agents.Core.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Teams.Apps.MessageExtensions;
using Microsoft.Teams.Apps.Schema;
using Microsoft.Teams.Cards;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using AdaptiveCard = Microsoft.Teams.Cards.AdaptiveCard;

namespace BotMessageExtensions;

public class BotMessageExtensionsAgent(
    AgentApplicationOptions options,
    IHttpClientFactory httpClientFactory) : AgentApplication(options)
{
    [ActivityRoute(ActivityTypes.Invoke)]
    public async Task OnInvokeAsync(
        ITurnContext turnContext,
        ITurnState turnState,
        CancellationToken cancellationToken)
    {
        if (string.Equals(turnContext.Activity.Name, "composeExtension/query", StringComparison.OrdinalIgnoreCase))
        {
            MessageExtensionQuery query = DeserializeValue<MessageExtensionQuery>(turnContext.Activity.Value) ?? new MessageExtensionQuery();
            MessageExtensionResponse response = await OnWikipediaSearchAsync(query, cancellationToken);
            await SendInvokeResponseAsync(turnContext, response, cancellationToken);
            return;
        }

        if (string.Equals(turnContext.Activity.Name, "composeExtension/queryLink", StringComparison.OrdinalIgnoreCase))
        {
            MessageExtensionQueryLink? query = DeserializeValue<MessageExtensionQueryLink>(turnContext.Activity.Value);
            MessageExtensionResponse response = CardResultResponse(CreateLinkPreviewCard(query?.Url?.ToString() ?? string.Empty));
            await SendInvokeResponseAsync(turnContext, response, cancellationToken);
        }
    }

    [MessageRoute]
    public async Task OnMessageAsync(
        ITurnContext turnContext,
        ITurnState turnState,
        CancellationToken cancellationToken)
    {
        string text = turnContext.Activity.Text ?? string.Empty;
        if (text.Contains("help", StringComparison.OrdinalIgnoreCase))
        {
            await turnContext.SendActivityAsync(
                "Hi! I'm the Search Messaging Extension Agent!\n\n" +
                "Use me in the compose area to search for Wikipedia articles\n",
                cancellationToken: cancellationToken);
            return;
        }

        await turnContext.SendActivityAsync(
            $"You said: {turnContext.Activity.Text}\n\nType 'help' to learn more.",
            cancellationToken: cancellationToken);
    }

    private async Task<MessageExtensionResponse> OnWikipediaSearchAsync(
        MessageExtensionQuery query,
        CancellationToken cancellationToken)
    {
        string commandId = query.CommandId ?? string.Empty;
        string searchQuery = query.Parameters?.FirstOrDefault()?.Value?.ToString() ?? string.Empty;
        Logger.LogInformation("Query: command={CommandId}, query={SearchQuery}", commandId, searchQuery);

        List<TeamsAttachment> attachments = (await SearchWikipediaAsync(searchQuery, cancellationToken))
            .Select(result =>
            {
                return CreateAttachment(CreateWikipediaCard(result));
            })
            .ToList();

        if (attachments.Count == 0)
        {
            return MessageExtensionResponse.CreateBuilder()
                .WithType(MessageExtensionResponseTypes.Message)
                .WithText($"No results found for '{searchQuery}'")
                .Build().Body!;
        }

        return MessageExtensionResponse.CreateBuilder()
            .WithType(MessageExtensionResponseTypes.Result)
            .WithAttachmentLayout(TeamsAttachmentLayouts.List)
            .WithAttachments([.. attachments])
            .Build().Body!;
    }

    private static async Task SendInvokeResponseAsync(
        ITurnContext turnContext,
        MessageExtensionResponse response,
        CancellationToken cancellationToken)
    {
        IActivity invokeResponseActivity = new Activity
        {
            Type = ActivityTypes.InvokeResponse,
            Value = new InvokeResponse
            {
                Status = 200,
                Body = response
            }
        };

        await turnContext.SendActivityAsync(invokeResponseActivity, cancellationToken);
    }

    private static T? DeserializeValue<T>(object? value) where T : class
    {
        if (value is null)
        {
            return null;
        }

        if (value is T typedValue)
        {
            return typedValue;
        }

        if (value is JObject jsonObject)
        {
            return jsonObject.ToObject<T>();
        }

        string serialized = JsonConvert.SerializeObject(value);
        return JsonConvert.DeserializeObject<T>(serialized);
    }

    private static AdaptiveCard CreateWikipediaCard(JToken result)
    {
        string title = result["title"]?.ToString() ?? "No Title";
        string snippet = Regex.Replace(result["snippet"]?.ToString() ?? string.Empty, "<[^>]+>", string.Empty);

        return new AdaptiveCard
        {
            Version = Microsoft.Teams.Cards.Version.Version1_4,
            Body =
            [
                new TextBlock(title) { Weight = TextWeight.Bolder, Size = TextSize.Large },
                new TextBlock(snippet) { Wrap = true, IsSubtle = true }
            ],
            Actions =
            [
                new OpenUrlAction($"https://en.wikipedia.org/wiki/{Uri.EscapeDataString(title.Replace(' ', '_'))}") { Title = "Read on Wikipedia" }
            ]
        };
    }

    private static AdaptiveCard CreateLinkPreviewCard(string url)
    {
        return new AdaptiveCard
        {
            Version = Microsoft.Teams.Cards.Version.Version1_4,
            Body =
            [
                new TextBlock("Link Preview") { Weight = TextWeight.Bolder, Size = TextSize.Medium },
                new TextBlock($"URL: {url}") { IsSubtle = true, Wrap = true },
                new TextBlock("This is a preview of the linked content generated by the message extension.")
                {
                    Wrap = true,
                    Size = TextSize.Small
                }
            ]
        };
    }

    private async Task<List<JToken>> SearchWikipediaAsync(string query, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return [];
        }

        try
        {
            HttpClient httpClient = httpClientFactory.CreateClient();
            httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("BotMessageExtensions/1.0 (Teams Bot; +https://example.com)");

            Dictionary<string, string> parameters = new()
            {
                ["action"] = "query",
                ["format"] = "json",
                ["list"] = "search",
                ["srsearch"] = query,
                ["utf8"] = "1",
                ["srlimit"] = "8"
            };

            string queryString = string.Join(
                "&",
                parameters.Select(parameter => $"{parameter.Key}={Uri.EscapeDataString(parameter.Value)}"));
            string url = $"https://en.wikipedia.org/w/api.php?{queryString}";

            string response = await httpClient.GetStringAsync(url, cancellationToken);
            JObject json = JObject.Parse(response);
            JArray? searchResults = json["query"]?["search"] as JArray;

            return searchResults?.ToList() ?? [];
        }
        catch (HttpRequestException exception)
        {
            Logger.LogError(exception, "Wikipedia search failed");
            return [];
        }
        catch (Newtonsoft.Json.JsonException exception)
        {
            Logger.LogError(exception, "Wikipedia search response could not be parsed");
            return [];
        }
    }

    private static TeamsAttachment CreateAttachment(AdaptiveCard card)
    {
        return TeamsAttachment.CreateBuilder()
            .WithAdaptiveCard(System.Text.Json.JsonSerializer.SerializeToElement(card))
            .Build();
    }

    private static MessageExtensionResponse CardResultResponse(AdaptiveCard card)
    {
        return MessageExtensionResponse.CreateBuilder()
            .WithType(MessageExtensionResponseTypes.Result)
            .WithAttachmentLayout(TeamsAttachmentLayouts.List)
            .WithAttachments(CreateAttachment(card))
            .Build().Body!;
    }
}
