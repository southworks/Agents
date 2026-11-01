// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Builder.State;
using Microsoft.Agents.Core.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Teams.Apps.Schema;
using Microsoft.Teams.Apps.TaskModules;
using Microsoft.Teams.Cards;
using Microsoft.Teams.Common;
using System.Text.Json;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Action = Microsoft.Teams.Cards.Action;
using AdaptiveCard = Microsoft.Teams.Cards.AdaptiveCard;
using CoreAttachment = Microsoft.Agents.Core.Models.Attachment;
using TaskModuleTask = Microsoft.Teams.Apps.TaskModules.Response;
using TaskResponse = Microsoft.Teams.Apps.TaskModules.TaskModuleResponse;

namespace Microsoft.Teams.Samples.BotTaskModules;

public partial class BotTaskModulesAgent : AgentApplication
{
    private readonly string _botEndpoint;

    public BotTaskModulesAgent(
        AgentApplicationOptions options,
        IConfiguration configuration) : base(options)
    {
        _botEndpoint = configuration["BotEndpoint"]
            ?? throw new InvalidOperationException("BotEndpoint must be configured.");

        OnActivity(ActivityTypes.Message, OnMessageAsync, rank: RouteRank.Last);
        OnActivity(ActivityTypes.Invoke, OnTaskModuleInvokeAsync, rank: RouteRank.Last);
    }

    private System.Threading.Tasks.Task OnMessageAsync(
        ITurnContext turnContext,
        ITurnState turnState,
        CancellationToken cancellationToken)
    {
        var card = new AdaptiveCard
        {
            Body =
            [
                new TextBlock("Task Module Invocation from Adaptive Card")
                {
                    Weight = TextWeight.Bolder,
                    Size = TextSize.Large
                }
            ],
            Actions =
            [
                CreateTaskFetchAction("Adaptive Card", "AdaptiveCard"),
                CreateTaskFetchAction("Custom Form", "CustomForm"),
                CreateTaskFetchAction("Multi-step Form", "MultiStep")
            ]
        };

        return turnContext.SendActivityAsync(
            MessageFactory.Attachment(new CoreAttachment(ContentTypes.AdaptiveCard, content: card)),
            cancellationToken);
    }

    private async Task OnTaskModuleInvokeAsync(
        ITurnContext turnContext,
        ITurnState turnState,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(turnContext.Activity.Name, "task/fetch", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(turnContext.Activity.Name, "task/submit", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        JsonElement root = ToCardJsonElement(turnContext.Activity.Value);
        TaskResponse responseBody;

        if (string.Equals(turnContext.Activity.Name, "task/fetch", StringComparison.OrdinalIgnoreCase))
        {
            string dialogType = GetDataValue(root, "data") ?? string.Empty;
            responseBody = dialogType switch
            {
                "AdaptiveCard" => CreateAdaptiveCardTask(),
                "CustomForm" => CreateCustomFormTask(),
                "MultiStep" => CreateMultiStepOneTask(),
                _ => Message("Unknown dialog type")
            };
        }
        else
        {
            string submissionType = GetDataValue(root, "submissiontype") ?? string.Empty;
            string name = GetDataValue(root, "name") ?? "Unknown";
            string email = GetDataValue(root, "email") ?? "Unknown";
            string userText = GetDataValue(root, "usertext") ?? string.Empty;

            switch (submissionType)
            {
                case "multi_step_1":
                    responseBody = CreateMultiStepTwoTask(name);
                    break;
                case "multi_step_2":
                    await turnContext.SendActivityAsync(
                        $"Hi {name}, thanks for submitting! Your email is {email}",
                        cancellationToken: cancellationToken);
                    responseBody = Message("Multi-step form completed!");
                    break;
                case "custom_form":
                    await turnContext.SendActivityAsync(
                        $"Hi {name}, thanks for submitting! Your email is {email}",
                        cancellationToken: cancellationToken);
                    responseBody = Message("Form submitted successfully");
                    break;
                default:
                    await turnContext.SendActivityAsync(
                        $"You submitted: {userText}",
                        cancellationToken: cancellationToken);
                    responseBody = Message("Thanks for submitting!");
                    break;
            }
        }

        await turnContext.SendActivityAsync(new Activity
        {
            Type = ActivityTypes.InvokeResponse,
            Value = new InvokeResponse
            {
                Status = 200,
                Body = responseBody
            }
        }, cancellationToken);
    }

    private static TaskResponse CreateAdaptiveCardTask()
    {
        var dialogCard = new AdaptiveCard
        {
            Body =
            [
                new TextBlock("Enter Text Here") { Weight = TextWeight.Bolder },
                new TextInput
                {
                    Id = "usertext",
                    Placeholder = "add some text and submit",
                    IsMultiline = true
                }
            ],
            Actions = [new SubmitAction { Title = "Submit" }]
        };

        return ContinueWith(
            "Adaptive Card: Inputs",
            400,
            200,
            TeamsAttachment.CreateBuilder().WithAdaptiveCard(ToCardJson(dialogCard)).Build());
    }

    private TaskResponse CreateCustomFormTask()
    {
        return new TaskResponse
        {
            Task = new TaskModuleTask
            {
                Type = TaskModuleResponseTypes.Continue,
                Value = new
                {
                    title = "Custom Form",
                    url = $"{_botEndpoint}/customform",
                    fallbackUrl = $"{_botEndpoint}/customform",
                    height = 450,
                    width = 510
                }
            }
        };
    }

    private static TaskResponse CreateMultiStepOneTask()
    {
        var stepOneCard = new AdaptiveCard
        {
            Body =
            [
                new TextBlock("Step 1 of 2 - Your Name")
                {
                    Size = TextSize.Large,
                    Weight = TextWeight.Bolder
                },
                new TextInput
                {
                    Id = "name",
                    Label = "Name",
                    Placeholder = "Enter your name",
                    IsRequired = true
                }
            ],
            Actions =
            [
                new SubmitAction()
                    .WithTitle("Next")
                    .WithData(CreateSubmitData(("submissiontype", "multi_step_1")))
            ]
        };

        return ContinueWith(
            "Multi-step Form",
            400,
            300,
            TeamsAttachment.CreateBuilder().WithAdaptiveCard(ToCardJson(stepOneCard)).Build());
    }

    private static TaskResponse CreateMultiStepTwoTask(string name)
    {
        var stepTwoCard = new AdaptiveCard
        {
            Body =
            [
                new TextBlock("Step 2 of 2 - Your Email")
                {
                    Size = TextSize.Large,
                    Weight = TextWeight.Bolder
                },
                new TextInput
                {
                    Id = "email",
                    Label = "Email",
                    Placeholder = "Enter your email",
                    IsRequired = true
                }
            ],
            Actions =
            [
                new SubmitAction()
                    .WithTitle("Submit")
                    .WithData(CreateSubmitData(
                        ("submissiontype", "multi_step_2"),
                        ("name", name)))
            ]
        };

        return ContinueWith(
            "Multi-step Form: Step 2",
            400,
            300,
            TeamsAttachment.CreateBuilder().WithAdaptiveCard(ToCardJson(stepTwoCard)).Build());
    }

    private static Union<string, SubmitActionData> CreateSubmitData(
        params (string Key, object? Value)[] values)
    {
        var properties = new Dictionary<string, object?>();
        foreach ((string key, object? value) in values)
        {
            properties[key] = value;
        }

        return new Union<string, SubmitActionData>(
            new SubmitActionData { NonSchemaProperties = properties });
    }

    private static SubmitAction CreateTaskFetchAction(string title, string value)
        => new SubmitAction()
            .WithTitle(title)
            .WithData(CreateSubmitData(
                ("msteams", new TaskFetchSubmitActionData()),
                ("data", value)));

    private static TaskResponse ContinueWith(
        string title,
        int width,
        int height,
        TeamsAttachment card)
    {
        var response = TaskResponse.CreateBuilder()
            .WithType(TaskModuleResponseTypes.Continue)
            .WithTitle(title)
            .WithHeight(height)
            .WithWidth(width)
            .WithCard(card)
            .Build();
        return response.Body ?? throw new InvalidOperationException("Task module continue response body is required.");
    }

    private static TaskResponse Message(string text)
    {
        var response = TaskResponse.CreateBuilder()
            .WithType(TaskModuleResponseTypes.Message)
            .WithMessage(text)
            .Build();
        return response.Body ?? throw new InvalidOperationException("Task module message response body is required.");
    }

    private static JsonElement ToCardJson(AdaptiveCard card) => JsonDocument.Parse(card.Serialize()).RootElement;

    private static JsonElement ToCardJsonElement(object? value)
        => value is JsonElement element
            ? element
            : JsonSerializer.SerializeToElement(value);

    private static string? GetDataValue(JsonElement root, string key)
    {
        if (!root.TryGetProperty("data", out JsonElement data))
        {
            return null;
        }

        if (data.TryGetProperty(key, out JsonElement value) && value.ValueKind == JsonValueKind.String)
        {
            return value.GetString();
        }

        return null;
    }
}
