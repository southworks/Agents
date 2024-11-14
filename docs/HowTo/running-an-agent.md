### Local development

Local development means running the Sample on 'your' workstation for development and debugging purposes.

Local development begins with utilizing the Bot Framework Emulator and Visual Studio on your workstation to build and run your Agent while debugging from Visual Studio.

If you do not wish to configure authentication at this time, Skip to "Running an Agent for the first time".

### Authentication and Local Development

There are two ways to support local development, depending on what your working with.

**- Anonymous or No-Authentication**

While this is the simplest way to get started and run your Agent, there are important limitations to consider.

When running in Anonymous mode, your Agent will not be able to create authentication tokens to access other services, Nor can it interact with Azure Bot Services. Therefor, Anonymous Mode is there to support testing basic operational features of the Agent and to work with and test various events that your Agent can process. It should be used only during initial development.

> [!IMPORTANT]
> A sample is configured, by default, for Anonymous Authentication. Before using this sample with Azure Bot Service, it is necessary to configure authentication.

**- Configured Authentication with Entra ID.**

Configuring authentication for your Agent will allow it to communicate with Azure Bot Services and create access tokens for other services.

However there are a few key items to consider when configuring authentication for your Agent.

1. Both Azure Bot Service's Bot registration and your Agent Must use the same ClientID for creating an authentication token.
    1. By default Azure Bot Service will create a Managed Identity when you initially configure the bot registration.  **This type of identity cannot currently be used when working with Local Development**.
    1. To successfully use **Local Development** with an Azure bot Service Identity, you must utilize either **Client Secret** or **Client Certificate** based authentication.
1. Once you are ready to deploy to Azure App Services, you can use all types of Identity supported.
    1. Its often more efficient to have an Azure Bot Service Registration for Local Development and a separate one configured for your App Services Deployment.

## Running an Agent for the first time

To run the Bot1 Sample for the first time:

1. Open the Bot1 Sample in Visual Studio 2022
1. Run it in Debug Mode (F5)
1. A blank web page will open, note down the URL which should be similar too `https://localhost:65349/`
1. Open the [BotFramework Emulator](https://github.com/Microsoft/BotFramework-Emulator/releases)
    1. Click **Open Bot**
    1. In the bot URL field input the URL you noted down from the web page and add /api/messages to it. It should appear similar to `https://localhost:65349/api/messages`
    1. Click **Connect**
