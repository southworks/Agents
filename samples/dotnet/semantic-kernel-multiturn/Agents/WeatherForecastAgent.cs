// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Agents;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;
using SemanticKernelMultiturn.Plugins;
using System;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace SemanticKernelMultiturn.Agents;

public class WeatherForecastAgent
{
    private const int MaximumHistoryMessages = 20;
    private const int MaximumFormatAttempts = 2;
    private const string AgentName = "WeatherForecastAgent";
    private const string AgentInstructions = """
        You are a friendly assistant that helps people find a weather forecast for a given time and place.
        Ask follow-up questions until you have both a location and a date. Once you have enough information,
        use the weather forecast tool and adaptive card tool, then return the result as an Adaptive Card.

        The Adaptive Card must use version 1.5 and include the location, date, temperature in Celsius and
        Fahrenheit, and a button for more details. The button must point to
        https://www.msn.com/en-us/weather/forecast/in-{location}, replacing {location} with a URL-encoded location.

        Respond only in JSON using one of these shapes:
        { "contentType": "Text", "content": "Follow-up question" }
        { "contentType": "AdaptiveCard", "content": { "type": "AdaptiveCard", "version": "1.5" } }
        """;

    private readonly ChatCompletionAgent _agent;

    public WeatherForecastAgent(Kernel kernel, IServiceProvider services)
    {
        ArgumentNullException.ThrowIfNull(kernel);
        ArgumentNullException.ThrowIfNull(services);

        Kernel turnKernel = kernel.Clone();
        turnKernel.Plugins.Add(KernelPluginFactory.CreateFromType<DateTimePlugin>(serviceProvider: services));
        turnKernel.Plugins.Add(KernelPluginFactory.CreateFromType<WeatherForecastPlugin>(serviceProvider: services));
        turnKernel.Plugins.Add(KernelPluginFactory.CreateFromType<AdaptiveCardPlugin>(serviceProvider: services));

        this._agent = new ChatCompletionAgent
        {
            Instructions = AgentInstructions,
            Name = AgentName,
            Kernel = turnKernel,
            Arguments = new KernelArguments(new OpenAIPromptExecutionSettings
            {
                FunctionChoiceBehavior = FunctionChoiceBehavior.Auto(),
                ResponseFormat = "json_object",
                Temperature = 0,
                TopP = 1
            })
        };
    }

    /// <summary>
    /// Invokes the agent with the given input and returns the response.
    /// </summary>
    /// <param name="input">A message to process.</param>
    /// <returns>An instance of <see cref="WeatherForecastAgentResponse"/></returns>
    public async Task<WeatherForecastAgentResponse> InvokeAgentAsync(string input, ChatHistory chatHistory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(input);
        ArgumentNullException.ThrowIfNull(chatHistory);

        chatHistory.Add(new ChatMessageContent(AuthorRole.User, input));
        AgentThread thread = new ChatHistoryAgentThread();

        for (int attempt = 0; attempt < MaximumFormatAttempts; attempt++)
        {
            StringBuilder responseBuilder = new();
            await foreach (ChatMessageContent response in this._agent.InvokeAsync(chatHistory, thread: thread))
            {
                chatHistory.Add(response);
                responseBuilder.Append(response.Content);
            }

            if (TryParseResponse(responseBuilder.ToString(), out WeatherForecastAgentResponse? result))
            {
                TrimHistory(chatHistory);
                return result!;
            }

            if (attempt + 1 < MaximumFormatAttempts)
            {
                chatHistory.Add(new ChatMessageContent(
                    AuthorRole.User,
                    "The previous response did not match the required JSON schema. Return only a valid response object."));
            }
        }

        throw new InvalidOperationException("The model did not return a valid weather response.");
    }

    private static bool TryParseResponse(string value, out WeatherForecastAgentResponse? response)
    {
        response = null;
        try
        {
            JsonObject? json = JsonNode.Parse(RemoveMarkdownFences(value))?.AsObject();
            string? contentType = json?["contentType"]?.GetValue<string>();
            JsonNode? content = json?["content"]?.DeepClone();
            if (content == null || !Enum.TryParse(contentType, ignoreCase: true, out WeatherForecastAgentResponseContentType parsedType))
            {
                return false;
            }

            if (parsedType == WeatherForecastAgentResponseContentType.Text
                && (content is not JsonValue textValue || !textValue.TryGetValue(out string? _)))
            {
                return false;
            }

            JsonNode? normalizedContent = parsedType == WeatherForecastAgentResponseContentType.AdaptiveCard
                ? NormalizeAdaptiveCard(content)
                : content;
            if (normalizedContent == null)
            {
                return false;
            }

            response = new WeatherForecastAgentResponse
            {
                ContentType = parsedType,
                Content = normalizedContent
            };
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static JsonNode? NormalizeAdaptiveCard(JsonNode content)
    {
        JsonNode? card = content;
        if (content is JsonValue value && value.TryGetValue(out string? stringContent))
        {
            card = JsonNode.Parse(RemoveMarkdownFences(stringContent ?? string.Empty));
        }

        return card is JsonObject cardObject
            && cardObject["type"]?.GetValue<string>() == "AdaptiveCard"
            && cardObject["version"]?.GetValue<string>() == "1.5"
            && cardObject["body"] is JsonArray
                ? card
                : null;
    }

    private static string RemoveMarkdownFences(string value) => value
        .Replace("```json", string.Empty, StringComparison.OrdinalIgnoreCase)
        .Replace("```", string.Empty, StringComparison.Ordinal)
        .Trim();

    private static void TrimHistory(ChatHistory chatHistory)
    {
        while (chatHistory.Count > MaximumHistoryMessages)
        {
            chatHistory.RemoveAt(0);
        }
    }
}
