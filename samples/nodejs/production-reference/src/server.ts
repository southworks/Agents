// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Server } from 'node:http'
import express, { type Express, type Request, type Response } from 'express'
import { createAgentRequestHandler } from '@microsoft/agents-hosting-express'
import { loadAuthConfigFromEnv, type AgentApplication, type Storage, type TurnState } from '@microsoft/agents-hosting'
import { recordFailure } from './telemetry.js'

const readinessKey = 'health.readiness'

export function createServer (agent: AgentApplication<TurnState>, storage: Pick<Storage, 'write' | 'delete'>): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '256kb' }))

  app.get('/health/live', (_request: Request, response: Response) => response.status(200).json({ status: 'ok' }))
  app.get('/health/ready', async (_request: Request, response: Response) => {
    try {
      await storage.write({ [readinessKey]: { eTag: '*', checked: true } })
      await storage.delete([readinessKey])
      response.status(200).json({ status: 'ready' })
    } catch {
      recordFailure('readiness')
      response.status(503).json({ status: 'not ready' })
    }
  })

  const handler = createAgentRequestHandler(agent, loadAuthConfigFromEnv())
  app.post(
    '/api/messages',
    requireWebChatServiceUrl,
    async (request, response, next) => {
      try {
        await handler(request, response)
      } catch (error) {
        next(error)
      }
    }
  )

  app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    const status = httpErrorStatus(error)
    const category = status < 500 ? 'payload' : 'http'
    recordFailure(category)
    if (response.headersSent) return
    response.status(status).json({ error: 'Request could not be processed.' })
  })
  return app
}

function httpErrorStatus (error: unknown): number {
  if (typeof error !== 'object' || error === null || !('status' in error)) return 500
  const status = Number(error.status)
  return status >= 400 && status < 500 ? status : 500
}

function requireWebChatServiceUrl (request: Request, response: Response, next: express.NextFunction): void {
  // Let the SDK return 401 for an unsigned request before inspecting its activity payload.
  if (!request.headers.authorization) {
    next()
    return
  }
  try {
    const host = new URL(String(request.body?.serviceUrl ?? '')).hostname.toLowerCase()
    if (host === 'webchat.botframework.com') {
      next()
      return
    }
  } catch {
    // Reject a malformed service URL with the same generic client error.
  }
  response.status(400).json({ error: 'Unsupported channel.' })
}

export function listen (app: Express, port: number): Server {
  const server = app.listen(port, () => {
    const address = server.address()
    const boundPort = typeof address === 'object' && address ? address.port : port
    const appServiceHostname = process.env.WEBSITE_HOSTNAME?.trim()
    const baseUrl = appServiceHostname
      ? `https://${appServiceHostname}`
      : `http://localhost:${boundPort}`
    console.log([
      'Agent server listening:',
      `- Messages: ${baseUrl}/api/messages`,
      `- Liveness: ${baseUrl}/health/live`,
      `- Readiness: ${baseUrl}/health/ready`
    ].join('\n'))
  })
  return server
}

export function closeServer (server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
