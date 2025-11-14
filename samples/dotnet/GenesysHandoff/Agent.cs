using GenesysHandoff.Genesys;
using Microsoft.Agents.Builder;
using Microsoft.Agents.Builder.App;
using Microsoft.Agents.CopilotStudio.Client;
using Microsoft.Agents.Core.Models;
using Microsoft.Agents.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace GenesysHandoff
{
    public static class Agent
    {
        private static IGenesysService? globalGenesysClient = null;

        public static AgentApplication CreateAgentApplication(IServiceProvider serviceProvider, IConfiguration configuration)
        {
            const string MCSConversationPropertyName = "MCSConversationId";
            const string IsEscalatedPropertyName = "IsEscalated";

            var app = new AgentApplication(serviceProvider.GetRequiredService<AgentApplicationOptions>());

            CopilotClient GetClient(AgentApplication app, ITurnContext turnContext)
            {
                var settings = new ConnectionSettings(configuration.GetSection("CopilotStudioAgent"));
                string[] scopes = [CopilotClient.ScopeFromSettings(settings)];

                return new CopilotClient(
                    settings,
                    serviceProvider.GetService<IHttpClientFactory>()!,
                    tokenProviderFunction: async (s) =>
                    {
                        return await app.UserAuthorization.ExchangeTurnTokenAsync(turnContext, "mcs", exchangeScopes: scopes);
                    },
                    NullLogger.Instance,
                    "mcs");
            }

            IGenesysService GetGenesysService(AgentApplication app)
            {
                if (globalGenesysClient == null)
                {
                    var settings = new GenesysConnectionSetting(configuration.GetSection("Genesys"));
                    globalGenesysClient = new GenesysService(settings, serviceProvider.GetService<IHttpClientFactory>()!, serviceProvider.GetService<IStorage>()!);
                }
                return globalGenesysClient;
            }

            app.OnMessage("-reset", async (turnContext, turnState, cancellationToken) =>
            {
                turnState.Conversation.DeleteValue(MCSConversationPropertyName);
                turnState.Conversation.DeleteValue(IsEscalatedPropertyName);
                await turnContext.SendActivityAsync("The conversation has been reset.", cancellationToken: cancellationToken);
            }, rank: RouteRank.First);

            app.OnMessage("-signout", async (turnContext, turnState, cancellationToken) =>
            {
                await app.UserAuthorization.SignOutUserAsync(turnContext, turnState, cancellationToken: cancellationToken);
                await turnContext.SendActivityAsync("You have signed out", cancellationToken: cancellationToken);
            }, rank: RouteRank.First);

            app.OnActivity((turnContext, cancellationToken) => Task.FromResult(true), async (turnContext, turnState, cancellationToken) =>
            {
                var mcsConversationId = turnState.Conversation.GetValue<string>(MCSConversationPropertyName);
                var cpsClient = GetClient(app, turnContext);

                if (string.IsNullOrEmpty(mcsConversationId))
                {
                    await foreach (IActivity activity in cpsClient.StartConversationAsync(emitStartConversationEvent: true, cancellationToken: cancellationToken))
                    {
                        if (activity.IsType(ActivityTypes.Message))
                        {
                            await turnContext.SendActivityAsync(activity.Text, cancellationToken: cancellationToken);
                            turnState.Conversation.SetValue(MCSConversationPropertyName, activity.Conversation.Id);
                        }
                    }
                }
                else if (turnContext.Activity.IsType(ActivityTypes.Message))
                {
                    var isEscalated = turnState.Conversation.GetValue<bool>(IsEscalatedPropertyName);
                    if (isEscalated)
                    {
                        var genesysClient = GetGenesysService(app);
                        await genesysClient.SendMessageToGenesysAsync(turnContext.Activity, mcsConversationId, cancellationToken);
                    }
                    else
                    {
                        await foreach (IActivity activity in cpsClient.AskQuestionAsync(turnContext.Activity.Text, mcsConversationId, cancellationToken))
                        {
                            if (activity.IsType(ActivityTypes.Message))
                            {
                                await turnContext.SendActivityAsync(activity.Text, cancellationToken: cancellationToken);
                            }
                            if (activity.IsType(ActivityTypes.Event) && activity.Name.Equals("GenesysHandoff"))
                            {
                                turnState.Conversation.SetValue(IsEscalatedPropertyName, true);
                                var genesysClient = GetGenesysService(app);
                                var summarizationActivity = turnContext.Activity.GetConversationReference().GetContinuationActivity();
                                summarizationActivity.Text = activity.Value?.ToString() ?? "The chat is being escalated to a human agent.";
                                await genesysClient.SendMessageToGenesysAsync(summarizationActivity, mcsConversationId, cancellationToken);
                            }
                        }
                    }
                }
            }, autoSignInHandlers: ["mcs"]);

            app.UserAuthorization.OnUserSignInFailure(async (turnContext, turnState, handlerName, response, initiatingActivity, cancellationToken) =>
            {
                await turnContext.SendActivityAsync($"SignIn failed with '{handlerName}': {response.Cause}/{response.Error!.Message}", cancellationToken: cancellationToken);
            });

            return app;
        }
    }
}