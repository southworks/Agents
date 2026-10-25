// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Builder.State;
using Microsoft.Agents.Core.Models;
using Microsoft.Extensions.Logging;
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
        string activityName = turnContext.Activity.Name ?? string.Empty;
        JObject payload = JObject.FromObject(turnContext.Activity.Value ?? new object());

        if (string.Equals(activityName, "composeExtension/query", StringComparison.OrdinalIgnoreCase))
        {
            await HandleQueryAsync(turnContext, payload, cancellationToken);
            return;
        }

        if (string.Equals(activityName, "composeExtension/queryLink", StringComparison.OrdinalIgnoreCase))
        {
            await HandleQueryLinkAsync(turnContext, payload, cancellationToken);
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

    private async Task HandleQueryAsync(ITurnContext turnContext, JObject payload, CancellationToken cancellationToken)
    {
        string commandId = payload["commandId"]?.ToString() ?? string.Empty;
        string searchQuery = payload["parameters"]?.FirstOrDefault()?["value"]?.ToString() ?? string.Empty;

        Logger.LogInformation("Query: command={CommandId}, query={SearchQuery}", commandId, searchQuery);

        List<object> attachments = [];
        if (string.Equals(commandId, "wikipediaSearch", StringComparison.Ordinal))
        {
            attachments = (await SearchWikipediaAsync(searchQuery, cancellationToken))
                .Select(result =>
                {
                    string title = result["title"]?.ToString() ?? "No Title";
                    string snippet = Regex.Replace(result["snippet"]?.ToString() ?? string.Empty, "<[^>]+>", string.Empty);
                    return (object)new
                    {
                        contentType = ContentTypes.AdaptiveCard,
                        content = CreateWikipediaCard(result),
                        preview = new
                        {
                            contentType = "application/vnd.microsoft.card.thumbnail",
                            content = new { title, text = snippet }
                        }
                    };
                })
                .ToList();
        }

        object responseBody = attachments.Count == 0
            ? new
            {
                composeExtension = new
                {
                    type = "message",
                    text = $"No results found for '{searchQuery}'"
                }
            }
            : new
            {
                composeExtension = new
                {
                    type = "result",
                    attachmentLayout = "list",
                    attachments
                }
            };

        await SendInvokeResponseAsync(turnContext, responseBody, cancellationToken);
    }

    private Task HandleQueryLinkAsync(ITurnContext turnContext, JObject payload, CancellationToken cancellationToken)
    {
        string url = payload["url"]?.ToString() ?? string.Empty;

        object responseBody = new
        {
            composeExtension = new
            {
                type = "result",
                attachmentLayout = "list",
                attachments = new[]
                {
                    new
                    {
                        contentType = ContentTypes.AdaptiveCard,
                        content = CreateLinkPreviewCard(url)
                    }
                }
            }
        };

        return SendInvokeResponseAsync(turnContext, responseBody, cancellationToken);
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
        catch (System.Text.Json.JsonException exception)
        {
            Logger.LogError(exception, "Wikipedia search response could not be parsed");
            return [];
        }
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

    private static Task SendInvokeResponseAsync(ITurnContext turnContext, object responseBody, CancellationToken cancellationToken)
    {
        return turnContext.SendActivityAsync(
            new Activity
            {
                Type = ActivityTypes.InvokeResponse,
                Value = new InvokeResponse
                {
                    Status = 200,
                    Body = responseBody
                }
            },
            cancellationToken);
    }
}
