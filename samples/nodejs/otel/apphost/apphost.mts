// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createBuilder, OtlpProtocol } from './.aspire/modules/aspire.mjs'

const envFile = join(import.meta.dirname, '../.env')

if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

const builder = await createBuilder()
const clientId = process.env.connections__serviceConnection__settings__clientId
const clientSecret = process.env.connections__serviceConnection__settings__clientSecret
const tenantId = process.env.connections__serviceConnection__settings__tenantId
const hasCredentials = clientId && clientSecret && tenantId
const playgroundArgs = ['run', 'agentsplayground', '--', '--port', '56150']
const authenticationStatus = hasCredentials
  ? { icon: '🔐', text: 'with credentials' }
  : { icon: '🔓', text: 'anonymous' }

if (hasCredentials) {
  playgroundArgs.push('--cid', clientId, '--cs', clientSecret, '--tid', tenantId)
}

const agent = await builder
  .addExecutable('agent', 'npm', '..', ['run', 'start'])
  .withUrl('http://localhost:3978', { displayText: `${authenticationStatus.icon} http://localhost:3978 (${authenticationStatus.text})` })
  .withEnvironment('PORT', '3978')
  .withExternalHttpEndpoints()
  .withOtlpExporter({ protocol: OtlpProtocol.Grpc })

await builder
  .addExecutable('playground', 'npm', '..', playgroundArgs)
  .withUrl('http://localhost:56150', { displayText: `${authenticationStatus.icon} http://localhost:56150 (${authenticationStatus.text})` })
  .withEnvironment('TEAMSAPPTESTER_BROWSER', 'none')
  .waitFor(agent)

await builder.build().run()
