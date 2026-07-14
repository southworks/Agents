## Protect downstream user access

When to use it: Use user authorization handlers when a sample calls Microsoft Graph, Copilot Studio, Power Platform, or any downstream API on behalf of the signed-in user.

Why it matters: Inbound JWT authentication proves the channel or caller can send the activity. It does not automatically prove that the user has consented to the downstream API scopes your sample wants to call.

Require an authorization handler on routes that need user tokens:

```ts
import { AgentApplication, TurnContext, TurnState } from '@microsoft/agents-hosting'

const agent = new AgentApplication<TurnState>({
  authorization: {
    graph: {
      title: 'Sign in',
      text: 'Sign in to continue.',
    },
  },
})

agent.onActivity('message', async (context: TurnContext, _state: TurnState) => {
  const token = await agent.authorization.exchangeToken(context, 'graph', {
    scopes: ['https://graph.microsoft.com/.default'],
  })

  if (!token.token) {
    await context.sendActivity('Sign in is required before continuing.')
    return
  }

  // Call the downstream API with token.token here.
}, ['graph'])
```

Configure the handler and OBO connection through environment settings:

```env
AgentApplication__UserAuthorization__Handlers__graph__Settings__azureBotOAuthConnectionName=GraphConnection
AgentApplication__UserAuthorization__Handlers__graph__Settings__title=Sign in
AgentApplication__UserAuthorization__Handlers__graph__Settings__text=Sign in to continue.
AgentApplication__UserAuthorization__Handlers__graph__Settings__oboConnectionName=graphOboConnection
AgentApplication__UserAuthorization__Handlers__graph__Settings__oboScopes=https://graph.microsoft.com/.default

connections__graphOboConnection__settings__clientId=<obo-app-id>
connections__graphOboConnection__settings__clientSecret=<secret-from-secret-store>
connections__graphOboConnection__settings__tenantId=<tenant-id>
connections__graphOboConnection__settings__authorityEndpoint=https://login.microsoftonline.com
```

Request the smallest set of downstream scopes needed for the sample, handle sign-out, and avoid logging access tokens or decoded token contents.
