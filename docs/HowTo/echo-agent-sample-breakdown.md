## The structure of an Echo Agent 

One of the best and easiest ways to get started with the Microsoft 365 Agents SDK is to use the echobot.cs sample in C#. You can access the sample here. 

Within the sample, the appsettings.json file specifies the configuration information for your bot, such as its app ID. If using certain technologies or using this bot in production, you'll need to add your specific keys or URL to this configuration

The echoBot.csproj file specifies dependencies and their associated versions for your bot. You should have the required files from the Echo Agent sample. Additional dependencies can be installed using NuGet package manager or the dotnet add package command. 

### Overview 

The Echo Agent can be broken down into three classes:

- Programstart.cs

- Botcontroller.cs

- Echobot.cs

### Resource Provisioning (program.cs)

Previously where startup.cs was used, program.cs is now used in .NET 5 or later. The program.cs file is where the connected services and any keys from appsettings.json are loaded from when the builder object for the web application is created, configuring how the application is configured using your settings.  

### Messaging endpoint 

The sample implements a web service with a messaging endpoint. When it receives a request, the service extracts the authentication header and request payload and forwards them to the adapter. 

Each incoming request represents the start of a new turn. 

### The agent logic (echobot.cs)

The echo bot uses an activity handler and implements handlers for the activity types it recognizes and reacts to. In the sample, these are the conversation update and message activities. 

A conversation update activity includes information on who has joined or left the conversation. For non-group conversations, both the bot and the user join the conversation when it starts. For group conversations, a conversation update is generated whenever someone joins or leaves the conversation, whether that's the agent or a user. 

A message activity represents a message the user sends to the agent

The echo agent/bot welcomes a user when they join the conversation and echoes back any messages they send to the bot. 
