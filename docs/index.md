# Microsoft 365 Agents SDK

The Microsoft 365 Agent SDK simplifies building full stack, multichannel, trusted agents for platforms including M365, Teams, Copilot Studio, and Webchat. We also offer integrations with 3rd parties such as Facebook Messenger, Slack, or Twilio. The SDK provides developers with the building blocks to create agents that handle user interactions, orchestrate requests, reason responses, and collaborate with other agents.

The M365 Agent SDK is a comprehensive framework for building enterprise-grade agents, enabling developers to integrate components from the Azure AI Foundry SDK, Semantic Kernel, as well as AI components from other vendors.

Please note, you may find references to Bot Framework throughout the code and the existing documentation, which includes legacy functionality which is being transitioned out of the SDK. We will be updating the documentation over time and will post updated content here (and also on Microsoft Learn) 

Below you can find some key documentation to get started with the Agents SDK

## Start here
- [Getting Started - link to be added]
- [How an Agent Works - link to be added]
- [Deep dive into the Echo Agent/Bot Sample - link to be added]

## Running and configuring an Agent
- [Create and test a basic agent - link to be added]
- [Running an Agent](./HowTo/running-an-agent.md) 
- [Configuring OAuth for an Agent](./HowTo/azurebot-user-authentication-fic.md)

## Additional guidance
- [Creating an Azure Bot - Single Tenant](./HowTo/azurebot-create-single-secret.md) 
- [Creating an Azure Bot - Managed Identity](./HowTo/azurebot-create-msi.md) 
- [DotNet Agents SDK - MSAL Configuration](/HowTo/MSALAuthConfigurationOptions.md)

## Samples

Samples are the best way to get started with learning about the Agents SDK. 

| No. | Sample Name                        | Feature                            | Level        | Description                                                                                                                                                                                                                                               | C# Project Link                                               |
|----|------------------------------------|------------------------------------|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| 1   | Echo Agent/Bot                 | Microsoft 365 Agents SDK                        | Basic        | This is the best sample to start with to learn the basics of the Agents SDK and work through the various steps from local testing to deploying the agent in Azure. No additional services needed, and also no editing required in the code.                                                                                 | [Link](src/samples/tobeadded/)                   |
| 2   | Semantic Kernel                    | Microsoft 365 Agents SDK                         | Basic        | Get started with the Agents SDK together with Semantic Kernel                                                        | [Link](src/samples/tobeadded/)  
| 3   | Conversation Bot                    | Microsoft 365 Agents SDK                         | Basic        | This sample shows how to incorporate basic conversational flow into a Teams application. It also illustrates a few of the Teams-specific calls you can make from your bot.                                                                                | [Link](src/samples/teams/ConversationBot/)  
| 4   | Copilot Studio Skill                    | Microsoft 365 Agents SDK                         | Intermediate        | Get started with creating a skill that can be referenced from Microsoft Copilot Studio                                     | [Link](src/samples/teams/ConversationBot/)  
| 5   | Multi-Agent with Copilot Studio                  | Microsoft 365 Agents SDK                         | Intermediate        | Learn the basics of connecting multiple agents together that are created with different services, including Microsoft Copilot Studio                                                                       | [Link](src/samples/teams/ConversationBot/)  
| 6   | Messaging Extensions Search          | Messaging Extension                | Intermediate | This sample demonstrates how to use search-based Messaging Extensions with the Copilot SDK. It enables users to search for and select items via the command bar, supporting various interactions such as querying data and selecting results for further actions.                                                                                                                                                              | [Link](src/samples/teams/MessagingExtensionsSearch/)         |
| 7   | Adaptive Card Actions                | Adaptive Cards                     | Intermediate | This sample demonstrates how to implement different Adaptive Card action types using the Copilot SDK in Microsoft Teams.                                                                                                                                   | [Link](src/samples/teams/AdaptiveCardActions/)               |
| 8   | Teams Authentication				| Authentication using OAuthPrompt  | Intermediate | This sample demonstrates user authentication in a Microsoft Teams bot, integrating OAuth tailored for Teams' unique authentication flow. Unlike other channels, Teams uses an Invoke Activity for authentication, which requires forwarding to the dialog with OAuthPrompt. A customizable TeamsActivityHandler, extending ActivityHandler, supports this flow seamlessly. | [Link](src/samples/teams/bot-teams-authentication/)          |
| 9   | Teams SSO							| SSO & Graph Integration | Advanced     | This sample demonstrates how to integrate Azure AD authentication in Microsoft Teams using a bot with Single Sign-On (SSO) capabilities. Built with the Copilot SDK, it showcases OAuth SSO, Adaptive Cards, and Microsoft Graph API interactions. The sample includes reusable components, like the TeamsActivityHandler, for handling Invoke Activity in Teams. It provides a step-by-step setup guide to authenticate users with identity providers such as Microsoft Entra ID, GitHub, and others. | [Link](src/samples/teams/bot-conversation-sso-quickstart)   |



