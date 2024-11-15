# What is the Microsoft 365 Agents SDK

The Microsoft 365 Agents SDK is an SDK for building self-hosted Agents. It is a collection of libraries and tools that allow you to build an agent in code. The Agents SDK facilitates communication between client and agent(s) by handling the conversation between them. It provides an easy path to incorporate Microsoft AI services, such as Graph, Azure OpenAI as well as non-Microsoft AI services.  

With this framework, developers can create agents deployable to a channel of choice, with scaffolding to handle the required communication. Developers can also leverage numerous generative AI services that are secure and compliant, available on any channel by using the Azure Bot Service to facilitate the hosting and adapters.  

## What is an Agent?

A key use case of conversational AI was to use technology to answer frequently asked questions from employees or customers. This was commonly achieved through natural language understanding (NLU) technology, a type of AI that can understand, interpret and direct logic to generate the right responses based on the utterance or intent identified.  

Now, generative AI provides a much easier, quicker and simpler way to provide responses to questions based on large language models. It does this without having to manually author each individual topic flow and logic. Generative AI generates outputs based on the input to the model and the nature of the underlying foundation model. There are ways to tailor the output of generative AI, including fine-tuning and prompt engineering. 

This experience can be seen in Microsoft 365 Copilot.  Supported with business data via the Microsoft Graph or internet sources, Microsoft 365 Copilot can generate grounded answers to a user’s questions. Organizations can choose to create ‘copilot agents’ that extend the behavior and functionality of Microsoft 365 Copilot using the embedded builder or Microsoft Copilot Studio. Additionally, organizations can choose to create standalone ‘agents’. 

There are various routes to creating a standalone agent. One of these is the Microsoft 365 Agents SDK.

The Agents SDK provides the scaffolding required to manage communication (typically via messages), channel management and deployment capabilities using the activity protocol. 

## What is the Activity Protocol?

The activity protocol allows for agent logic and middleware logic to run agnostic to whatever the surface area (channel, like Microsoft Teams) the agent exists in, brokering the communication and translating the messages to a common set of libraries, so events and messages can be routed to where they need to go, at the right time

The Agents SDK includes: 

- Agent Framework SDK for developing agents in C#. 

- Bot Connector Service, which relays messages and events between copilots and channels 

- Azure resources for agent management and configuration. 

Additionally, agents may use other Azure services or 3rd party AI Services, such as: 

- Azure AI services to build intelligent applications 

- Azure Storage for cloud storage solution 

### Add AI Services to your Agent with Agents SDK

As part of an agent, developers will want to add orchestration services such as Semantic Kernel and AI services, such as Azure OpenAI. The Agents SDK provides samples that explain how this can be done, with plans to include shared interfaces to make this even easier.  

### How to build a copilot with the Agents SDK

Today, you can start using the Agent Framework SDK in C#. Python and Node.js are coming soon. Start with Visual Studio or Visual Studio code.  

### Testing 

Once you have planned and built your agent, you can test it locally and then test it in the planned channel of choice. 

Agents can have many different parts working together. There are several ways to test copilots before they're released for use, including:

- Unauthenticated testing using the Bot Framework SDK Emulator. Supports limited scenarios. 

- Authenticated local testing using the Dev Tunnels 

- Test your copilot in the chosen channel in a developer environment: Once configured through the Azure portal your copilot can also be reached through a web chat interface. The web chat interface is a great way to grant access to your copilot to testers and other people who don't have direct access to the copilot's running code. 

### Connect to a Channel (Publish) 

Connect your copilot to channels, such as Facebook, Messenger, Slack, Microsoft Teams, Telegram, and SMS via Twilio. Together with Azure Bot Service, the Agents SDK does most of the work necessary to send and receive messages from all different platforms—your agent application receives a unified, normalized stream of messages regardless of the number and type of channels it's connected to. 

### Evaluate 

Use the data collected in Azure portal to identify opportunities to improve the capabilities and performance of your copilot. You can get data like traffic, latency, and integrations. Analytics also provides conversation-level reporting on user, message, and channel data. 
