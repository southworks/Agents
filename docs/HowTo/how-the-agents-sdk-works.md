# How the Microsoft 365 Agents SDK works
The Agents SDK allows you to build agents that can be hosted on the Azure Bot Service. The service defines a REST API and an activity protocol for how your agent and channels or users can interact. The Agents SDK builds upon this REST API and provides an abstraction of the service working between the client and the agent so that you can focus on the conversational logic. As a developer, while you don't need to understand the REST service to use the SDK, understanding some of its features can be helpful. 

Agents built using the Agents SDK typically have a conversational interface. They can be used to shift simple, repetitive tasks, such as taking a dinner reservation or gathering profile information, to automated systems that may no longer require direct human intervention. Users converse with an agent using text, interactive cards, and speech. A agent interaction can be a simple single turn question and answer, or it can be a sophisticated multi-turn conversation that intelligently provides access to services. 

Interactions in an agent involve the exchange of activities, which are handled in turns. 

## Activities 
Every interaction between the user (or a channel) and the agent is represented as an activity. Activities can represent human text or speech, app-to-app notifications, reactions to other messages, and more.

## Turns 
The Agents SDK uses a turn based conversational model that uses turns to operate a pipeline of operations from the initial client where a user is asking a question, and the journey to the adaptor, middleware and then to the agent logic itself.  

In a conversation, people often speak one-at-a-time, taking turns speaking. With an agent, it typically reacts to user input. Within the Agents SDK, a turn consists of the user's incoming activity to the agent and any activity the agent sends back to the user as an immediate response. You can think of a turn as the processing associated with the agent receiving a given activity and a full ‘cycle’ of the pipeline operation of such activity, from start to finish.

For example, a user might ask an agent to perform a certain task. The agent might respond with a question to get more information about the task, at which point this turn ends. On the next turn, the agent receives a new message from the user that might contain the answer to the agent's question, or it might represent a change of subject or a request to ignore the initial request to perform the task. Because of this, it is important to manage rhe multi-turn nature of conversations and store any required context and history of the conversation (where developers bring their own storage options). Common use cases often goes beyond a single turn question and answer. 

### Tip 
It is up to the channel/client to interpret and implement the activity protocol. How each channel does might be a little different based on what a client supports and how it functions. As a developer, understanding how the client works and functions is important and to not assume they all implement it the same way. For example, some channels send conversation update activities first, and some send conversation update activities after they send the first message activity. A channel might include agent the agent and user in one conversation update activity, while another might send two conversation update activities. 

Support for features provided by the SDK and REST API varies by channel. You can test your agent using the Bot Framework Emulator, but you should also test all features of your agent on each channel in which you intend to make your agent available. 

## Agent application structure 
The SDK defines an bot class that handles the conversational reasoning for the agent app. 

The bot class: 

- Recognizes and interprets the user's input. 

- Reasons about the input and performs relevant tasks. 

- Generates responses about what the agent is doing or has done.

The SDK also defines an adapter class that handles connectivity with the channels. 

The adapter: 

- Provides a method for handling requests from and methods for generating requests to the user's channel. 

- Includes a middleware pipeline, which includes turn processing outside of your agent's turn handler. 

- Calls the agent's turn handler and catches errors not otherwise handled in the turn handler.
  

In addition, agents often need to retrieve and store state each turn. State is handled through storage, agent state, and property accessor classes. The SDK doesn't provide built-in storage, but does provide abstractions for storage and a few implementations of a storage layer.  A developer can choose to use what storage is required and bring the required services to the agent application and manage the lifecycle of the data that is used and accessed within the agent.  

The Agents SDK doesn't require you use a specific application layer to send and receive web requests. When you create an agent using Agents SDK, you provide the code to receive the HTTP traffic and forward it to the adapter. You can check out the repo to get started with some of the samples available in Public Preview, with more being added soon, including in Node.JS and Python when those languages become available. 

### Note 
The Agents SDK currently supports C# only. Node.JS & Python support coming soon. 

## Agent logic 
The bot object contains the conversational reasoning or logic for a turn and exposes a turn handler, that is the method that can accept incoming activities from the agent adapter. 

The SDK provides a couple different paradigms for managing your agent logic. 

Activity handlers provide an event-driven model in which the incoming activity types and subtypes are the events. Consider an activity handler for agents that have limited, short interactions with the user. 


- Use an activity handler and implement handlers for each activity type or subtype your agent will recognize and react to. 

- Use a Teams activity handler to create agents that can connect to the Teams channel. (The Teams channel requires the agent to handle some channel-specific behavior.)
  

## The agent adapter 
The adapter has a process activity method for starting a turn that:


- takes the request body (the request payload, translated to an activity) and the request header as arguments. 

- checks whether the authentication header is valid. 

- creates a context object for the turn. The context object includes information about the activity. 

- sends the context object through its middleware pipeline. 

 - sends the context object to the agent object's turn handler.
   

### Additionally, it:

- Formats and sends response activities. These responses are typically messages for the user but can also include information to be consumed by the user's channel directly. 

- Surfaces other methods provided by the Agent Connector REST API, such as update message and delete message. 

- Catches errors or exceptions not otherwise caught for the turn.
  

### The turn context 

- The turn context object provides information about the current activity such as the sender and receiver, the channel, and other data needed to process the activity. It also allows for the addition of information during the turn across various layers of the agent. 

- The turn context is one of the most important abstractions in the Agents SDK. Not only does it carry the inbound activity to all the downstream pipeline activities but also it also provides the mechanism where developers can send outbound activities.
  

## Agent state and storage 

As with other web apps, an agent is inherently stateless. State within a agent follows the same paradigms as modern web applications, and the Agents SDK provides storage layer and state management abstractions to make state management easier. There is no storage model that stores context or history by default, and this must be brought to the agent if required, meaning each turn is independent and carries nothing forward as each turn proceeds, not retaining any information unless the developer creates a state management and connects a storage application and maintains it.  

Whilst it is stateless out of the box, developers can leverage classes such as UserState, ConversationState and PrivateConversationState that contains methods for storing and retrieving state information in a conversation. In memory storage is not suitable for production environments as it will be lost when the agent is restarted or the process ends and therefore a developer needs to consider what storage implementation, they wish to use e.g. Azure Blob Storage, Cosmos DB or others. 


## Messaging endpoint and provisioning 

Typically, your application will need a REST endpoint at which to receive messages. It will also need to provide resources for your agent in accordance with the platform you decide to use. 


### HTTP Details 

Activities arrive at the agent from the Agents SDK via an HTTP POST request. The agent responds to the inbound POST request with a 200 HTTP status code. Activities sent from the agent to the channel are sent on a separate HTTP POST to the Agents SDK. This, in turn, is acknowledged with a 200 HTTP status code. 

The protocol doesn't specify the order in which these POST requests and their acknowledgments are made. However, to fit with common HTTP service frameworks, typically these requests are nested, meaning that the outbound HTTP request is made from the agent within the scope of the inbound HTTP request. This pattern is illustrated in the earlier diagram. Since there are two distinct HTTP connections back-to-back, the security model must provide for both. 


### Managing agent resources 

You'll need to manage the resources for your agent, such as its app ID and password, and also information for any connected services. When you deploy your agent, it will need secure access to this information. To avoid complexity, most of the Agents SDK articles don't describe how to manage this information. 

- For general security information, see how Security and Authentication works in the Agents SDK. 

- To manage keys and secrets in Azure, see About Azure Key Vault. 

 
