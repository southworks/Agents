# Genesys Handoff Integration With Copilot Studio Sample

This is a sample of a simple conversation between a user and an Agent that hands off to a Genesys conversation.

## Prerequisites

- [.Net](https://dotnet.microsoft.com/en-us/download/dotnet/8.0) version 8.0
- [dev tunnel](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started?tabs=windows)
- [Microsoft 365 Agents Toolkit](https://github.com/OfficeDev/microsoft-365-agents-toolkit)
- [Genesys Dashboard](https://www.genesys.com): Obtain access credentials for the Genesys Dashboard to manage and monitor interactions effectively.
- [Microsoft Copilot Studio Platform](https://copilotstudio.microsoft.com): Verify your access to the Microsoft Copilot Studio platform, which is necessary for configuring and integrating with Genesys.
- [Azure Subscription](https://azure.microsoft.com/en-us/free/): Ensure you have access to an active Azure Subscription to support the required infrastructure and resource deployments.

## Running this sample
## Copilot Studio Setup
1. Create a Agent in [Copilot Studio](https://copilotstudio.microsoft.com)
2. Update the “Escalate” Topic:
    1. In Copilot Studio, navigate to the Topics section and select the "Escalate" topic.
    2. Modify the topic to include the Genesys handoff logic, ensuring that it captures user intent for escalation and initiates the handoff process to Genesys.    
        1. Create a Customize Response Node:
        ![Customize Response](./Images/CustomizeResponseImage.png "Customize Response")
        2. Set up a customize response node that summarizes the conversation so far. This summary will be used for Agent escalation. Additionally, configure a variable for the “Save bot response as” field to store the summarized data.
        3. Adjust Content Moderation Settings:  
            1. Uncheck the “Send a message” checkbox for the customize response property under the “Content moderation level” section to prevent automatic messaging. 
            ![Content Moderation](./Images/ContentModerationImage.png "Content Moderation")
    3. Create an Event Node:  
        1. Add an event node named “GenesysHandoff.” Set its value to the bot response variable configured in the previous step  
    4. The overall structure of your escalate topic should follow these steps to ensure smooth handoff and escalation.
      ![Escalate Topic Structure](./Images/CompleteEscalationTopic.png "Escalate Topic Structure")   
3. Publish your created Copilot
    1. Go to **Settings** => **Advanced** => **Metadata** and note the following values:
        1. Schema name
        2. Environment Id
    2. Set the Copilot Studio Agent information in appsettings
      ```json
        "CopilotStudioAgent": {
          "EnvironmentId": "", // Environment ID of environment with the CopilotStudio App.
          "SchemaName": "", // Schema Name of the Copilot to use
        }
      ```
## Genesys Setup
1. Configuring OAuth Integration for Genesys Agents
    1. To enable secure interactions for your agents within Genesys, you need to configure OAuth integration. Start by navigating to Admin > Integrations > OAuth in the Genesys platform. Here, create a new OAuth Client specifically for your agent.
    2. When creating this client, be sure to assign the Admin role. Assigning the Admin role ensures that the client has the necessary permissions to handle interactions and perform required actions within the Genesys environment.  
2. Configuring Platform for Messaging Flow. To set up the platform configuration for your messaging flow within Genesys, follow these steps:
    1.	Navigate to the Admin section within the Genesys Platform.
    2.	Go to Message and select Platform Configs.
    3.	Create a new Platform Config specifically for your desired flow.
        This configuration step is essential for ensuring proper integration and routing of messages through your flow.
        ![Platform Configs](./Images/GenesysPlatformConfig.png "Platform Configs")
3. Configuring Open Messaging on Genesys Platform.
    1.	To set up open messaging in Genesys, navigate to the Admin section.
    2.	From there, go to Message and select Platforms.
    3.	Create a new open messaging configuration tailored to your requirements    .
    4.	As part of this configuration, ensure you update the Outbound Notifications Webhook URL so that it points to your Azure hosting endpoint. The format for this URL should be:
        ```https://{{appServiceEndpoint}}/api/outbound```
        This step is critical to ensure that outbound notifications from Genesys are delivered to your application hosted on Azure.
        ![Open Messaging Config](./Images/OpenMessagingImage.png "Open Messaging Config")
    5. Copying the GUID for Genesys Integration. When configuring the Genesys integration, it is important to copy the GUID from the page URL. This unique identifier is required for the proper setup of the integration process. You will need to paste this GUID into the appSettings.config file as part of the configuration steps. This ensures that the integration between your application and the Genesys platform is correctly established and functions as intended.
4. Configuring Inbound Message Flow in Genesys Architect.
    1.	To handle inbound messages within Genesys, navigate to the Admin section and select Architect.
    2.	Within Architect, go to the Inbound Messages area. Here, you should create a new flow that will define how incoming messages are processed.
    3.	When setting up the new flow, choose the "Transfer to ACD" action. This option allows inbound messages to be escalated to the appropriate team.
    4.	You will then need to select the specific Queue where you want these escalated messages to be transferred. This ensures that messages are routed efficiently to the correct queue for further handling by the designated agents.
    ![Inbound Message Flow](./Images/MessagingFlow.png "Inbound Message Flow")
5. Configuring Message Routing in Genesys
    1.	To set up message routing in Genesys, navigate to the Admin section and select Routing. Within the Routing menu, choose Message Routing  .
    2.	Create a new Message Routing configuration by specifying your platform configuration and associating it with the appropriate message flow. This step ensures that messages are directed according to your platform's requirements and the defined flow, facilitating efficient handling and response.
    ![Message Routing](./Images/MessageRouting.png "Message Routing")
6. Add Genesys Configurations on Agent SDK. 
    1. Go to appsettings.json and update “Genesys” section with the following details:
```json
    "Genesys": {
      "OAuthClientId": "", // OAuth Client ID created in Genesys
      "OAuthClientSecret": "", // OAuth Client Secret created in Genesys
      "OrganizationId": "", // Organization ID from Genesys
      "PlatformConfigId": "" // Platform Config ID created in Genesys
    }
```
## Agent SDK Setup
1. Create an Azure Bot with one of these authentication types
   - [SingleTenant, Client Secret](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-create-single-secret)
   - [SingleTenant, Federated Credentials](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-create-federated-credentials) 
   - [User Assigned Managed Identity](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-create-managed-identity)
    
   > Be sure to follow the **Next Steps** at the end of these docs to configure your agent settings.

   > **IMPORTANT:** If you want to run your agent locally via devtunnels, the only support auth type is ClientSecrets and Certificates

2. Setting up OAuth

   > **IMPORTANT:** For Teams SSO, OAuth is always setup on the same App Registration used for the agent.  To make setting this sample up easier for other channels, do not create another App Registration; Do it all on the agents App Registration.

   1. Perform the steps in [Add user authorization using Federated Identity Credential](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-user-authorization-federated-credentials), with the following difference:
      - **API Permissions** tab
        1. **Dynamics CRM** with **user_impersonation**
        1. **Graph** with **User.Read**
        1. **Power Platform API** with **CopilotStudio.Copilots.Invoke**
        1. Grant Admin Consent for your tenant.
         
3. [Configure your .NET Agent to use OAuth](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/agent-oauth-configuration-dotnet)
   
4. Running the Agent
   1. Running the Agent locally
      - Requires a tunneling tool to allow for local development and debugging should you wish to do local development whilst connected to a external client such as Microsoft Teams.
      - **For ClientSecret or Certificate authentication types only.**  Federated Credentials and Managed Identity will not work via a tunnel to a local agent and must be deployed to an App Service or container.
      
      1. Run `dev tunnels`. Please follow [Create and host a dev tunnel](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started?tabs=windows) and host the tunnel with anonymous user access command as shown below:

         ```bash
         devtunnel host -p 3978 --allow-anonymous
         ```

      1. On the Azure Bot, select **Settings**, then **Configuration**, and update the **Messaging endpoint** to `{tunnel-url}/api/messages`

      1. Start the Agent in Visual Studio

   1. Deploy Agent code to Azure
      1. VS Publish works well for this.  But any tools used to deploy a web application will also work.
      1. On the Azure Bot, select **Settings**, then **Configuration**, and update the **Messaging endpoint** to `https://{{appServiceDomain}}/api/messages`

## Testing this agent with WebChat

   1. Select **Test in WebChat** on the Azure Bot

## Testing this Agent in Teams or M365

1. Update the manifest.json
   - Edit the `manifest.json` contained in the `/appManifest` folder
     - Replace with your AppId (that was created above) *everywhere* you see the place holder string `<<AAD_APP_CLIENT_ID>>`
     - Replace `<<BOT_DOMAIN>>` with your Agent url.  For example, the tunnel host name.
   - Zip up the contents of the `/appManifest` folder to create a `manifest.zip`
     - `manifest.json`
     - `outline.png`
     - `color.png`

1. Your Azure Bot should have the **Microsoft Teams** channel added under **Channels**.

1. Navigate to the Microsoft Admin Portal (MAC). Under **Settings** and **Integrated Apps,** select **Upload Custom App**.

1. Select the `manifest.zip` created in the previous step. 

1. After a short period of time, the agent shows up in Microsoft Teams and Microsoft 365 Copilot.

## Enabling JWT token validation
1. By default, the AspNet token validation is disabled in order to support local debugging.
1. Enable by updating appsettings
   ```json
   "TokenValidation": {
     "Enabled": true,
     "Audiences": [
       "{{ClientId}}" // this is the Client ID used for the Azure Bot
     ],
     "TenantId": "{{TenantId}}"
   },
   ```

## Further reading
To learn more about building Agents, see [Microsoft 365 Agents SDK](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/).

To add an image to this README, use the following Markdown syntax:

````````

For example, if you have an image named `diagram.png` in the same folder as the README:

````````

If the image is hosted online, use the direct URL:

````````

Make sure to commit the image file to your repository if using a local path.

