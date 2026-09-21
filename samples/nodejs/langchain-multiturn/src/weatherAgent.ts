// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplicationBuilder, TurnContext } from '@microsoft/agents-hosting'
import { AzureChatOpenAI, ChatOpenAI } from '@langchain/openai'
import { MemorySaver } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { createAgent, providerStrategy } from 'langchain'
import { z } from 'zod'
import { adaptiveCardTool } from './tools/adaptiveCardTool.js'
import { dateTimeTools } from './tools/dateTimeTool.js'
import { weatherForecastTool } from './tools/weatherForecastTool.js'
import { runWithTurnContext } from './tools/progressContext.js'

const welcomeMessage = 'Hello and welcome! I\'m here to help with all your weather forecast needs!'
const processingMessage = 'Working on a response for you'
const failureMessage = 'Sorry, I couldn\'t get the weather forecast at the moment.'

const agentInstructions = `
You are a friendly assistant that helps people find a weather forecast for a given time and place.
Ask follow-up questions until you have both a location and a date. Once you have a forecast, use the
weather forecast tool and adaptive card tool, then return the result as an Adaptive Card.

The Adaptive Card must use version 1.5 and include the location, date, temperature in Celsius and
Fahrenheit, and a button for more details. The button must point to
https://www.msn.com/en-us/weather/forecast/in-{location}, replacing {location} with a URL-encoded location.

Return Text while asking follow-up questions and AdaptiveCard after obtaining a forecast.
`

const textResponseSchema = z.object({
  contentType: z.literal('Text'),
  content: z.string()
}).strict()

const factSchema = z.object({
  title: z.string(),
  value: z.string()
}).strict()

const textBlockSchema = z.object({
  type: z.literal('TextBlock'),
  text: z.string(),
  weight: z.literal('Bolder'),
  size: z.literal('Medium'),
  wrap: z.boolean()
}).strict()

const factSetSchema = z.object({
  type: z.literal('FactSet'),
  facts: z.array(factSchema)
}).strict()

const openUrlActionSchema = z.object({
  type: z.literal('Action.OpenUrl'),
  title: z.string(),
  url: z.string()
}).strict()

const adaptiveCardResponseSchema = z.object({
  contentType: z.literal('AdaptiveCard'),
  content: z.object({
    type: z.literal('AdaptiveCard'),
    version: z.literal('1.5'),
    $schema: z.literal('http://adaptivecards.io/schemas/adaptive-card.json'),
    body: z.array(z.union([textBlockSchema, factSetSchema])).min(2).max(2),
    actions: z.array(openUrlActionSchema).min(1).max(1)
  }).strict()
}).strict()

const weatherForecastAgentResponseSchema = z.discriminatedUnion('contentType', [
  textResponseSchema,
  adaptiveCardResponseSchema
])

type WeatherForecastAgentResponse = z.infer<typeof weatherForecastAgentResponseSchema>

// Azure OpenAI strict structured output requires an object at the root of the JSON
// schema. The discriminated union above is retained for local validation, but it
// serializes to a root-level anyOf and is therefore not suitable for the request.
const weatherForecastAgentTransportSchema = z.object({
  contentType: z.enum(['Text', 'AdaptiveCard']),
  content: z.union([
    z.string(),
    adaptiveCardResponseSchema.shape.content
  ])
}).strict()

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} environment variable is missing and required.`)
  }
  return value
}

const useAzureOpenAI = (process.env.USE_AZURE_OPENAI ?? process.env.USE_AZURE_OPENAI_API) === 'true'

const agentModel = useAzureOpenAI
  ? new AzureChatOpenAI({
      azureOpenAIApiKey: requiredSetting('AZURE_OPENAI_API_KEY'),
      azureOpenAIApiInstanceName: requiredSetting('AZURE_OPENAI_API_INSTANCE_NAME'),
      azureOpenAIApiDeploymentName: requiredSetting('AZURE_OPENAI_DEPLOYMENT_NAME'),
      azureOpenAIApiVersion: requiredSetting('AZURE_OPENAI_API_VERSION'),
      temperature: 0,
      topP: 1
    })
  : new ChatOpenAI({
      apiKey: requiredSetting('OPENAI_API_KEY'),
      model: requiredSetting('OPENAI_MODEL_ID'),
      temperature: 0,
      topP: 1
    })

const weatherForecastAgent = createAgent({
  model: agentModel,
  name: 'WeatherForecastAgent',
  systemPrompt: agentInstructions,
  tools: [weatherForecastTool, adaptiveCardTool, ...dateTimeTools],
  checkpointer: new MemorySaver(),
  responseFormat: providerStrategy({
    schema: weatherForecastAgentTransportSchema,
    strict: true
  })
})

async function invokeWeatherForecastAgent(
  input: string,
  conversationId: string
): Promise<WeatherForecastAgentResponse> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = attempt === 0
      ? input
      : 'The previous response did not match the required schema. Return only a valid response object.'

    try {
      const result = await weatherForecastAgent.invoke(
        { messages: [new HumanMessage(message)] },
        { configurable: { thread_id: conversationId } }
      )
      return weatherForecastAgentResponseSchema.parse(result.structuredResponse)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

export const weatherAgent = new AgentApplicationBuilder().build()

weatherAgent.onConversationUpdate('membersAdded', async (context) => {
  await context.sendActivity(welcomeMessage)
})

weatherAgent.onActivity(ActivityTypes.Message, async (context: TurnContext) => {
  context.streamingResponse.setFeedbackLoop(true)
  context.streamingResponse.setGeneratedByAILabel(true)
  context.streamingResponse.queueInformativeUpdate(processingMessage)

  try {
    const userText = context.activity.text?.trim()
    if (!userText) {
      context.streamingResponse.queueTextChunk('Please enter a weather question.')
      return
    }

    const response = await runWithTurnContext(context, () => invokeWeatherForecastAgent(
      userText,
      context.activity.conversation!.id
    ))
    if (response.contentType === 'Text') {
      context.streamingResponse.queueTextChunk(response.content)
    } else {
      context.streamingResponse.setFinalMessage(Activity.fromObject({ type: ActivityTypes.Message }))
      context.streamingResponse.addAttachment({
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: response.content
      })
    }
  } catch (error) {
    console.error('Error during agent execution:', error)
    context.streamingResponse.queueTextChunk(failureMessage)
  } finally {
    await context.streamingResponse.endStream()
  }
})
