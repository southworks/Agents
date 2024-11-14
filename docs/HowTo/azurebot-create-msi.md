# Register a Managed Identity bot with Azure

This article shows how to register a bot with Azure AI Bot Service.

Your bot identity can be managed in Azure in a few different ways.

- As a user-assigned managed identity, so that you don't need to manage the bot's credentials yourself.
- As a single-tenant app.
- As a multi-tenant app.

> These instructions are for User Managed Identity.  If the bot is to be used for local debugging then Managed Identity will not work.  It is recommended that SingleTenant is used instead.  

> For those on the Microsoft Tenant, using either MultiTenant or SingleTenant with a secret is prohibited.  There are limited options for running locally in this case, with Certiciate SN+I being a viable alternative.  If this does not work for you, the only alternative is to deploy the Agent code to Azure and run there.

## Create the resource
Create the Azure Bot resource, which will allow you to register your bot with the Azure AI Bot Service.

1. Go to the Azure portal.

1. In the right pane, select **Create a resource**.

1. In the search box enter `bot`, then press Enter.

1. Select the **Azure Bot** card.

   ![Azure Bot Resource](media/azure-bot-resource.png)

1. Select **Create**.

1. Enter values in the required fields and review and update settings.

   a. Provide information under Project details. Select whether your bot will have global or local data residency. Currently, the local data residency feature is available for resources in the "westeurope" and "centralindia" region. For more information, see [Regionalization in Azure AI Bot Service](https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-concept-regionalization?view=azure-bot-service-4.0).

   ![Azure Bot Settings](media/azure-bot-project-details.png)

   b. Provide information under Microsoft App ID. Select how your bot identity will be managed in Azure and whether to create a new identity or use an existing one.

   ![Azure Bot Identity](media/azure-bot-ms-app-id.png)

1. Select **Review + create**.

1. If the validation passes, select **Create**.

1. Once the deployment completes, select Go to resource. You should see the bot and related resources listed in the resource group you selected.

1. If this is a Teams bot

   1. Select **Settings** on the left sidebar, then **Channels**.
   1. Select **Microsoft Teams** from the list, and choose appropriate options.
