// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.Builder.App.AdaptiveCards;
using Microsoft.Agents.Builder.State;
using Microsoft.Agents.Core.Models;
using CardsHandler = Microsoft.Teams.Samples.BotCards.Handlers.Cards;

namespace Microsoft.Teams.Samples.BotCards;

public partial class BotCardsAgent(AgentApplicationOptions options) : AgentApplication(options)
{
    [MessageRoute]
    public Task OnMessageAsync(
        ITurnContext turnContext,
        ITurnState turnState,
        CancellationToken cancellationToken)
    {
        string text = (turnContext.Activity.Text ?? string.Empty).Trim().ToLowerInvariant();

        if (text.Contains("card actions"))
        {
            return CardsHandler.SendAdaptiveCardActionsAsync(turnContext, cancellationToken);
        }

        if (text.Contains("toggle visibility"))
        {
            return CardsHandler.SendToggleVisibilityCardAsync(turnContext, cancellationToken);
        }

        return turnContext.SendActivityAsync(
            "Welcome to the Cards Agent! To interact with me, send one of the following commands: 'card actions' or 'toggle visibility'",
            cancellationToken: cancellationToken);
    }

    [ActionExecuteRoute("submit_name")]
    public Task<AdaptiveCardInvokeResponse> OnSubmitNameAsync(
        ITurnContext turnContext,
        ITurnState turnState,
        object data,
        CancellationToken cancellationToken)
    {
        JsonElement submittedData = JsonSerializer.SerializeToElement(data);
        if (!submittedData.TryGetProperty("name", out JsonElement nameProperty))
        {
            return Task.FromResult(
                AdaptiveCardInvokeResponseFactory.Message("No data specified"));
        }

        string name = nameProperty.ToString();

        return Task.FromResult(
            AdaptiveCardInvokeResponseFactory.Message($"Data Submitted: {name}"));
    }
}
