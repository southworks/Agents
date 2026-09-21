# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import json
from typing import Annotated, Any, Literal, TypeAlias

from pydantic import BaseModel, Field, TypeAdapter, ValidationError, field_validator
from semantic_kernel import Kernel
from semantic_kernel.agents import ChatCompletionAgent, ChatHistoryAgentThread
from semantic_kernel.connectors.ai.function_choice_behavior import FunctionChoiceBehavior
from semantic_kernel.connectors.ai.open_ai import OpenAIPromptExecutionSettings
from semantic_kernel.contents import ChatHistory
from semantic_kernel.functions import KernelArguments

from src.plugins import AdaptiveCardPlugin, DateTimePlugin, WeatherForecastPlugin

MAXIMUM_HISTORY_MESSAGES = 20
MAXIMUM_FORMAT_ATTEMPTS = 2


class TextWeatherForecastAgentResponse(BaseModel):
    contentType: Literal["Text"]
    content: str


class AdaptiveCardWeatherForecastAgentResponse(BaseModel):
    contentType: Literal["AdaptiveCard"]
    content: dict[str, Any]

    @field_validator("content")
    @classmethod
    def validate_adaptive_card(cls, value: dict[str, Any]) -> dict[str, Any]:
        if (
            value.get("type") != "AdaptiveCard"
            or value.get("version") != "1.5"
            or not isinstance(value.get("body"), list)
        ):
            raise ValueError("AdaptiveCard content must use Adaptive Card version 1.5.")
        return value


WeatherForecastAgentResponse: TypeAlias = Annotated[
    TextWeatherForecastAgentResponse | AdaptiveCardWeatherForecastAgentResponse,
    Field(discriminator="contentType"),
]
RESPONSE_ADAPTER = TypeAdapter(WeatherForecastAgentResponse)


class WeatherForecastAgent:
    agent_name = "WeatherForecastAgent"
    agent_instructions = """
        You are a friendly assistant that helps people find a weather forecast for a given time and place.
        Ask follow-up questions until you have both a location and a date. Once you have enough information,
        use the weather forecast tool and adaptive card tool, then return the result as an Adaptive Card.

        The Adaptive Card must use version 1.5 and include the location, date, temperature in Celsius and
        Fahrenheit, and a button for more details. The button must point to
        https://www.msn.com/en-us/weather/forecast/in-{location}, replacing {location} with a URL-encoded location.

        Respond only in JSON using one of these shapes:
        { "contentType": "Text", "content": "Follow-up question" }
        { "contentType": "AdaptiveCard", "content": { "type": "AdaptiveCard", "version": "1.5" } }
    """

    def __init__(self, client: Any):
        self.client = client
        self.execution_settings = OpenAIPromptExecutionSettings(
            function_choice_behavior=FunctionChoiceBehavior.Auto(),
            temperature=0,
            top_p=1,
            response_format={"type": "json_object"},
        )

    async def invoke_agent(
        self, input: str, chat_history: ChatHistory
    ) -> WeatherForecastAgentResponse:
        chat_history.add_user_message(input)

        for attempt in range(MAXIMUM_FORMAT_ATTEMPTS):
            kernel = Kernel()
            kernel.add_plugin(plugin=DateTimePlugin(), plugin_name="dateTime")
            kernel.add_plugin(plugin=WeatherForecastPlugin(), plugin_name="weatherForecast")
            kernel.add_plugin(plugin=AdaptiveCardPlugin(), plugin_name="adaptiveCard")

            agent = ChatCompletionAgent(
                service=self.client,
                name=self.agent_name,
                instructions=self.agent_instructions,
                kernel=kernel,
                arguments=KernelArguments(settings=self.execution_settings),
            )

            response_text = ""
            async for chat in agent.invoke(
                chat_history.to_prompt(), thread=ChatHistoryAgentThread()
            ):
                chat_history.add_message(chat.content)
                response_text += chat.content.content

            try:
                response = RESPONSE_ADAPTER.validate_python(
                    json.loads(_remove_markdown_fences(response_text))
                )
                _trim_history(chat_history)
                return response
            except (json.JSONDecodeError, ValidationError):
                if attempt + 1 < MAXIMUM_FORMAT_ATTEMPTS:
                    chat_history.add_user_message(
                        "The previous response did not match the required JSON schema. "
                        "Return only a valid response object."
                    )

        raise RuntimeError("The model did not return a valid weather response.")


def _remove_markdown_fences(value: str) -> str:
    return value.replace("```json", "").replace("```", "").strip()


def _trim_history(chat_history: ChatHistory) -> None:
    if len(chat_history.messages) > MAXIMUM_HISTORY_MESSAGES:
        chat_history.messages = chat_history.messages[-MAXIMUM_HISTORY_MESSAGES:]
