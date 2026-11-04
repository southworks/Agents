import os
from pathlib import Path

from dotenv import load_dotenv
from microsoft_agents.activity import Activity, load_configuration_from_env
from microsoft_agents.authentication.msal import MsalConnectionManager
from microsoft_agents.hosting.aiohttp import CloudAdapter
from microsoft_agents.hosting.core import AgentApplication, MemoryStorage, TurnState
from microsoft_agents.hosting.msteams import TeamsAgentExtension

load_dotenv()


def _card_action(title: str, verb: str) -> dict:
    return {
        "type": "Action.Submit",
        "title": title,
        "data": {
            "msteams": {
                "type": "task/fetch",
                "data": {"verb": verb},
            }
        },
    }


def _adaptive_card(body: list[dict], actions: list[dict], version: str = "1.4") -> dict:
    return {
        "type": "AdaptiveCard",
        "version": version,
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "body": body,
        "actions": actions,
    }


def _task_continue(value: dict) -> dict:
    return {"task": {"type": "continue", "value": value}}


def _task_message(value: str) -> dict:
    return {"task": {"type": "message", "value": value}}


async def _send_task_response(context, body: dict) -> None:
    await context.send_activity(
        Activity(
            type="invokeResponse",
            value={"status": 200, "body": body},
        )
    )


def create_agent(dependencies=None) -> AgentApplication[TurnState]:
    dependencies = dependencies or {}
    configuration = load_configuration_from_env(os.environ)
    connection_manager = dependencies.get("connection_manager")
    if connection_manager is None:
        connection_manager = MsalConnectionManager(**configuration)
    adapter = dependencies.get("adapter")
    if adapter is None:
        adapter = CloudAdapter(connection_manager=connection_manager)

    app = AgentApplication[TurnState](
        storage=MemoryStorage(),
        adapter=adapter,
        connection_manager=connection_manager,
        **configuration,
    )
    teams = TeamsAgentExtension(app)
    endpoint = dependencies.get("endpoint") or os.getenv(
        "BOT_ENDPOINT", "http://localhost:3978"
    )
    custom_form = Path(__file__).resolve().parents[1] / "pages" / "CustomForm" / "index.html"

    @app.activity("message")
    async def handle_message(context, _state: TurnState):
        card = _adaptive_card(
            [
                {
                    "type": "TextBlock",
                    "text": "Task Module Invocation from Adaptive Card",
                    "weight": "Bolder",
                    "size": "Large",
                }
            ],
            [
                _card_action("Adaptive Card", "adaptive_card"),
                _card_action("Custom Form", "custom_form"),
                _card_action("Multi-step Form", "multi_step_form"),
            ],
        )
        await context.send_activity(
            Activity(
                type="message",
                attachments=[
                    {
                        "contentType": "application/vnd.microsoft.card.adaptive",
                        "content": card,
                    }
                ],
            )
        )

    @app.invoke("task/fetch")
    async def handle_task_fetch(context, _state: TurnState):
        data = (context.activity.value or {}).get("data") or {}
        verb = data.get("verb")
        if verb == "adaptive_card":
            card = _adaptive_card(
                [
                    {
                        "type": "TextBlock",
                        "text": "Enter Text Here",
                        "weight": "Bolder",
                    },
                    {
                        "type": "Input.Text",
                        "id": "usertext",
                        "placeholder": "add some text and submit",
                        "isMultiline": True,
                    },
                ],
                [
                    {
                        "type": "Action.Submit",
                        "title": "Submit",
                        "data": {"verb": "adaptive_card_submit"},
                    }
                ],
                version="1.0",
            )
            await _send_task_response(context, _task_continue(
                {
                    "title": "Adaptive Card: Inputs",
                    "width": 400,
                    "height": 200,
                    "card": {
                        "contentType": "application/vnd.microsoft.card.adaptive",
                        "content": card,
                    },
                }
            ))
            return
        if verb == "custom_form":
            url = f"{endpoint.rstrip('/')}/customform"
            if not custom_form.is_file():
                raise FileNotFoundError(f"Custom form page not found: {custom_form}")
            await _send_task_response(context, _task_continue(
                {
                    "title": "Custom Form",
                    "width": 510,
                    "height": 450,
                    "url": url,
                    "fallbackUrl": url,
                }
            ))
            return
        if verb == "multi_step_form":
            card = _adaptive_card(
                [
                    {
                        "type": "TextBlock",
                        "text": "Step 1 of 2 - Your Name",
                        "size": "Large",
                        "weight": "Bolder",
                    },
                    {
                        "type": "Input.Text",
                        "id": "name",
                        "label": "Name",
                        "placeholder": "Enter your name",
                        "isRequired": True,
                    },
                ],
                [
                    {
                        "type": "Action.Submit",
                        "title": "Next",
                        "data": {"verb": "multi_step_1"},
                    }
                ],
            )
            await _send_task_response(context, _task_continue(
                {
                    "title": "Multi-step Form",
                    "width": 400,
                    "height": 300,
                    "card": {
                        "contentType": "application/vnd.microsoft.card.adaptive",
                        "content": card,
                    },
                }
            ))
            return
        await _send_task_response(context, _task_continue({"title": "Task Module"}))

    @app.invoke("task/submit")
    async def handle_task_submit(context, _state: TurnState):
        data = (context.activity.value or {}).get("data") or {}
        verb = data.get("verb")
        if verb == "adaptive_card_submit":
            await context.send_activity(f"You submitted: {data.get('usertext')}")
            await _send_task_response(context, _task_message("Thanks for submitting!"))
            return
        if verb == "custom_form_submit":
            await context.send_activity(
                f"Hi {data.get('name')}, thanks for submitting! "
                f"Your email is {data.get('email')}"
            )
            await _send_task_response(context, _task_message("Form submitted successfully"))
            return
        if verb == "multi_step_1":
            name = data.get("name")
            card = _adaptive_card(
                [
                    {
                        "type": "TextBlock",
                        "text": "Step 2 of 2 - Your Email",
                        "size": "Large",
                        "weight": "Bolder",
                    },
                    {
                        "type": "Input.Text",
                        "id": "email",
                        "label": "Email",
                        "placeholder": "Enter your email",
                        "isRequired": True,
                    },
                ],
                [
                    {
                        "type": "Action.Submit",
                        "title": "Submit",
                        "data": {"verb": "multi_step_2", "name": name},
                    }
                ],
            )
            await _send_task_response(context, _task_continue(
                {
                    "title": "Multi-step Form: Step 2",
                    "width": 400,
                    "height": 300,
                    "card": {
                        "contentType": "application/vnd.microsoft.card.adaptive",
                        "content": card,
                    },
                }
            ))
            return
        if verb == "multi_step_2":
            await context.send_activity(
                f"Hi {data.get('name')}, thanks for submitting! "
                f"Your email is {data.get('email')}"
            )
            await _send_task_response(context, _task_message("Multi-step form completed!"))
            return
        await _send_task_response(context, _task_message("Task submitted."))

    @app.error
    async def handle_error(context, error: Exception):
        print(f"Error occurred: {error}")
        if context:
            print(f"Context: {context}")

    return app
