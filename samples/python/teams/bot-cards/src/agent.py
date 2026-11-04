from os import environ

from dotenv import load_dotenv
from microsoft_agents.activity import Activity, load_configuration_from_env
from microsoft_agents.authentication.msal import MsalConnectionManager
from microsoft_agents.hosting.aiohttp import CloudAdapter
from microsoft_agents.hosting.core import AgentApplication, MemoryStorage
from microsoft_agents.hosting.msteams import TeamsAgentExtension


def create_agent(dependencies=None):
    load_dotenv()
    configuration = load_configuration_from_env(environ)
    dependencies = dependencies or {}
    connection_manager = dependencies.get("connection_manager")
    if connection_manager is None:
        connection_manager = MsalConnectionManager(**configuration)

    adapter = dependencies.get("adapter")
    if adapter is None:
        adapter = CloudAdapter(connection_manager=connection_manager)

    app = AgentApplication(
        storage=MemoryStorage(),
        adapter=adapter,
        connection_manager=connection_manager,
        **configuration,
    )
    TeamsAgentExtension(app)

    def card_attachment(card):
        return Activity(
            type="message",
            attachments=[
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": card,
                }
            ],
        )

    def create_card_actions_card():
        innermost_card = {
            "type": "AdaptiveCard",
            "body": [
                {"type": "TextBlock", "text": "**Welcome To Your New Card**"},
                {
                    "type": "TextBlock",
                    "text": "This is your new card inside another card",
                },
            ],
        }
        middle_card = {
            "type": "AdaptiveCard",
            "body": [
                {
                    "type": "TextBlock",
                    "text": "This card's action will show another card",
                }
            ],
            "actions": [
                {
                    "type": "Action.ShowCard",
                    "title": "Action.ShowCard",
                    "card": innermost_card,
                }
            ],
        }
        submit_form_card = {
            "type": "AdaptiveCard",
            "body": [
                {
                    "type": "Input.Text",
                    "id": "name",
                    "label": "Please enter your name:",
                    "isRequired": True,
                    "errorMessage": "Name is required",
                }
            ],
            "actions": [
                {
                    "type": "Action.Execute",
                    "title": "Submit",
                    "verb": "submit_name",
                    "data": {"action": "submit_name"},
                    "associatedInputs": "auto",
                }
            ],
        }
        return {
            "type": "AdaptiveCard",
            "version": "1.5",
            "body": [{"type": "TextBlock", "text": "Adaptive Card Actions"}],
            "actions": [
                {
                    "type": "Action.OpenUrl",
                    "title": "Action Open URL",
                    "url": "https://adaptivecards.io",
                },
                {
                    "type": "Action.ShowCard",
                    "title": "Action Submit",
                    "card": submit_form_card,
                },
                {
                    "type": "Action.ShowCard",
                    "title": "Action ShowCard",
                    "card": middle_card,
                },
            ],
        }

    def create_toggle_visibility_card():
        return {
            "type": "AdaptiveCard",
            "version": "1.5",
            "body": [
                {
                    "type": "TextBlock",
                    "text": "Click to show or hide the message",
                },
                {
                    "type": "TextBlock",
                    "id": "helloWorld",
                    "isVisible": False,
                    "text": "**Hello World!**",
                    "size": "ExtraLarge",
                },
            ],
            "actions": [
                {
                    "type": "Action.ToggleVisibility",
                    "title": "Click me!",
                    "targetElements": ["helloWorld"],
                }
            ],
        }

    @app.activity("message")
    async def handle_message(context, _state):
        text = (context.activity.text or "").strip().lower()
        if "card actions" in text:
            await context.send_activity(card_attachment(create_card_actions_card()))
        elif "toggle visibility" in text:
            await context.send_activity(
                card_attachment(create_toggle_visibility_card())
            )
        else:
            await context.send_activity(
                "Welcome to the Cards Agent! To interact with me, send one of the "
                "following commands: 'card actions' or 'toggle visibility'"
            )

    @app.invoke("adaptiveCard/action")
    async def handle_card_action(context, _state):
        value = context.activity.value or {}
        action = value.get("action") or {}
        data = action.get("data") or {}
        await context.send_activity(f"Data Submitted: {data.get('name', '')}")
        await context.send_activity(
            Activity(
                type="invokeResponse",
                value={
                    "status": 200,
                    "body": {
                        "statusCode": 200,
                        "type": "application/vnd.microsoft.activity.message",
                        "value": "Action processed successfully",
                    },
                },
            )
        )

    return app
