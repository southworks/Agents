/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Components } from 'botframework-webchat'
import { FluentThemeProvider } from 'botframework-webchat-fluent-theme'
import React, { useState, useEffect } from 'react'
import { CopilotStudioClient, CopilotStudioWebChat, CopilotStudioWebChatConnection } from '@microsoft/agents-copilotstudio-client'

import { settings } from './settings'
import { acquireToken } from './acquireToken'

const { BasicWebChat, Composer } = Components

function Chat () {
  const [connection, setConnection] = useState<CopilotStudioWebChatConnection | null>(null)

  const agentsSettings = {
    appClientId: settings.appClientId ?? '',
    tenantId: settings.tenantId ?? '',
    environmentId: settings.environmentId ?? '',
    customPowerPlatformCloud: settings.customPowerPlatformCloud,
    agentIdentifier: settings.agentIdentifier,
    directConnectUrl: settings.directConnectUrl,
  }
  const webchatSettings = { showTyping: true }

  useEffect(() => {
    (async () => {
      const token = await acquireToken(agentsSettings)
      const client = new CopilotStudioClient(agentsSettings, token)
      setConnection(CopilotStudioWebChat.createConnection(client, webchatSettings))
    })()
  }, [])
  return connection
    ? (
      <FluentThemeProvider>
        <Composer directLine={connection}>
          <BasicWebChat />
        </Composer>
      </FluentThemeProvider>
      )
    : null
}

export default Chat
