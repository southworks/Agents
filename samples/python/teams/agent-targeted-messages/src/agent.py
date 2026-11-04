"""Targeted reminder agent built on the Microsoft 365 Agents SDK."""

import asyncio
import logging
import re
import time
from dataclasses import dataclass
from os import environ
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
from microsoft_agents.activity import (
    Activity,
    Attachment,
    CardAction,
    ChannelAccount,
    SuggestedActions,
    load_configuration_from_env,
)
from microsoft_agents.authentication.msal import MsalConnectionManager
from microsoft_agents.hosting.aiohttp import CloudAdapter
from microsoft_agents.hosting.core import AgentApplication, MemoryStorage, TurnContext, TurnState
from microsoft_agents.hosting.core.app import ApplicationOptions, ProactiveOptions
from microsoft_agents.hosting.msteams import TeamsAgentExtension

load_dotenv()

TIME_PATTERN = re.compile(
    r"in\s+(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b",
    re.IGNORECASE,
)
MAX_DELAY_SECONDS = 2**31 - 1
logger = logging.getLogger(__name__)


@dataclass
class Reminder:
    id: str
    conversation_id: str
    conversation: Any
    target_user_id: str
    target_user_name: str
    creator_id: str
    creator_name: str
    text: str
    due_time: float
    cancel_timer: Callable[[], None] | None = None


def _activity_dict(activity: Any) -> dict[str, Any]:
    if isinstance(activity, dict):
        return activity
    if hasattr(activity, "model_dump"):
        return activity.model_dump(mode="json", by_alias=True, exclude_none=True)
    return {}


def _is_targeted(activity: Any) -> bool:
    recipient = getattr(activity, "recipient", None)
    recipient_value = _activity_dict(recipient)
    return bool(
        getattr(recipient, "is_targeted", False)
        or recipient_value.get("isTargeted")
        or recipient_value.get("is_targeted")
    )


def _strip_mention(text: str, activity: Any, user_id: str | None = None) -> str:
    for entity in getattr(activity, "entities", None) or []:
        value = _activity_dict(entity)
        mentioned = value.get("mentioned") or {}
        if value.get("type") == "mention" and (
            mentioned.get("id") == user_id or mentioned.get("id") == getattr(getattr(activity, "recipient", None), "id", None)
        ):
            mention_text = value.get("text")
            if mention_text:
                text = text.replace(mention_text, "")
    return text.strip()


def _parse_delay(text: str) -> int | None:
    match = TIME_PATTERN.search(text)
    if not match:
        return None
    value = int(match.group(1))
    unit = match.group(2).lower()
    multiplier = 1 if unit.startswith(("second", "sec")) or unit == "s" else (
        60 if unit.startswith(("minute", "min")) or unit == "m" else 3600
    )
    delay = value * multiplier
    return delay if 0 < delay <= MAX_DELAY_SECONDS else None


def _format_time_span(seconds: float) -> str:
    total = round(seconds)
    if total >= 3600:
        return f"{total // 3600}h {(total % 3600) // 60}m"
    if total >= 60:
        return f"{total // 60}m {total % 60}s"
    return f"{total}s"


def _parse_reminder(context: TurnContext, text: str) -> dict[str, Any] | None:
    activity = context.activity
    text = re.sub(r"^remind\b", "", text, flags=re.IGNORECASE).strip()
    sender = activity.from_property
    target_id = sender.id if sender else ""
    target_name = sender.name if sender else "You"
    if re.match(r"^me(?:\s|,|$)", text, re.IGNORECASE):
        text = re.sub(r"^me\b", "", text, count=1, flags=re.IGNORECASE).strip().lstrip(",").strip()
    else:
        for entity in getattr(activity, "entities", None) or []:
            value = _activity_dict(entity)
            mentioned = value.get("mentioned") or {}
            if value.get("type") == "mention" and mentioned.get("id") != getattr(activity.recipient, "id", None):
                target_id = mentioned.get("id", target_id)
                target_name = mentioned.get("name", "User")
                text = _strip_mention(text, activity, target_id)
                break
    delay = _parse_delay(text)
    if delay is None:
        return None
    reminder_text = TIME_PATTERN.sub("", text).strip().lstrip(",").strip()
    for prefix in ("to ", "that "):
        if reminder_text.lower().startswith(prefix):
            reminder_text = reminder_text[len(prefix):].strip()
    return {
        "target_id": target_id,
        "target_name": target_name,
        "text": reminder_text or "You have a reminder!",
        "delay": delay,
    }


def _card(title: str, body: list[dict[str, Any]], actions: list[dict[str, Any]]) -> Attachment:
    return Attachment(
        content_type="application/vnd.microsoft.card.adaptive",
        content={
            "type": "AdaptiveCard",
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "version": "1.5",
            "body": [{"type": "TextBlock", "text": title, "weight": "Bolder", "wrap": True}, *body],
            "actions": actions,
        },
    )


def _targeted_activity(
    text: str | None,
    recipient_id: str,
    recipient_name: str,
    attachments: list[Attachment] | None = None,
    suggested_actions: SuggestedActions | None = None,
    reply_to_id: str | None = None,
    targeted_message_id: str | None = None,
    ai_generated: bool = False,
) -> Activity:
    entities: list[dict[str, Any]] = [{"type": "activityTreatment", "treatment": "targeted"}]
    if targeted_message_id:
        entities.append({"type": "targetedMessageInfo", "targetedMessageId": targeted_message_id})
    if ai_generated:
        entities.append({"type": "https://schema.org/Message", "additionalType": ["AIGeneratedContent"]})
    fields: dict[str, Any] = {
        "type": "message",
        "recipient": ChannelAccount(id=recipient_id, name=recipient_name),
        "entities": entities,
    }
    if text is not None:
        fields["text"] = text
    if attachments:
        fields["attachments"] = attachments
    if suggested_actions is not None:
        fields["suggested_actions"] = suggested_actions
    if reply_to_id is not None:
        fields["reply_to_id"] = reply_to_id
    return Activity(**fields)


async def _wait_then_run(callback: Callable[[], Awaitable[None]], seconds: float) -> None:
    await asyncio.sleep(max(0, seconds))
    await callback()


def _suggestions(user_id: str | None, *items: tuple[str, str]) -> SuggestedActions:
    actions = [
        CardAction(type="Action.Submit", title=title, value={"command": value})
        for title, value in items
    ]
    return SuggestedActions(to=[user_id] if user_id else [], actions=actions)


def create_agent(dependencies: dict[str, Any] | None = None) -> AgentApplication:
    deps = dependencies or {}
    configuration = load_configuration_from_env(environ)
    manager = deps.get("connection_manager")
    if manager is None:
        manager = MsalConnectionManager(**configuration)
    adapter = deps.get("adapter")
    if adapter is None:
        adapter = CloudAdapter(connection_manager=manager)

    storage = MemoryStorage()
    app = AgentApplication[TurnState](
        options=ApplicationOptions(
            storage=storage,
            adapter=adapter,
            proactive=ProactiveOptions(storage=storage),
        ),
        connection_manager=manager,
    )
    teams = TeamsAgentExtension(app)
    reminders: dict[str, Reminder] = {}
    tasks: set[asyncio.Task[Any]] = set()
    now: Callable[[], float] = deps.get("now", time.time)
    schedule = deps.get("schedule")
    reaction = deps.get("reaction")
    if schedule is None:
        def schedule(callback: Callable[[], Awaitable[None]], seconds: float) -> Callable[[], None]:
            task = asyncio.create_task(_wait_then_run(callback, seconds))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
            return task.cancel

    async def close_background_tasks() -> None:
        for reminder in reminders.values():
            if reminder.cancel_timer:
                reminder.cancel_timer()
        reminders.clear()
        pending = list(tasks)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        tasks.clear()

    app.close_background_tasks = close_background_tasks

    async def send_private(
        context: TurnContext,
        text: str | None = None,
        *,
        recipient_id: str | None = None,
        recipient_name: str | None = None,
        attachments: list[Attachment] | None = None,
        suggestions: SuggestedActions | None = None,
        ai_generated: bool = False,
    ) -> None:
        activity = context.activity
        sender = activity.from_property
        target_id = recipient_id or (sender.id if sender else "")
        target_name = recipient_name or (sender.name if sender else "User")
        incoming_targeted = _is_targeted(activity)
        await context.send_activity(_targeted_activity(
            text,
            target_id,
            target_name,
            attachments,
            suggestions,
            targeted_message_id=activity.id if incoming_targeted else None,
            ai_generated=ai_generated,
        ))

    def reminder_id(context: TurnContext) -> str:
        return f"{int(now()) % 100000:05x}{id(context) % 0xFFFF:04x}"

    async def deliver(reminder: Reminder) -> None:
        if reminder.id not in reminders:
            return
        action_list = [
            {"type": "Action.Execute", "title": "Dismiss", "verb": "dismiss_reminder",
             "data": {"action": "dismiss_reminder", "reminderId": reminder.id}},
            {"type": "Action.Execute", "title": "Snooze 5 min", "verb": "snooze_reminder",
             "data": {"action": "snooze_reminder", "reminderId": reminder.id,
                      "reminderText": reminder.text, "snoozeMinutes": "5"}},
        ]
        card = _card("Reminder", [
            {"type": "TextBlock", "text": reminder.text, "wrap": True},
            {"type": "TextBlock", "text": f"Set by {reminder.creator_name}", "isSubtle": True, "wrap": True},
        ], action_list)

        async def send(continued: TurnContext) -> None:
            await continued.send_activity(_targeted_activity(
                None, reminder.target_user_id, reminder.target_user_name, [card]
            ))

        continuation = reminder.conversation.conversation_reference.get_continuation_activity()
        connection = configuration.get("CONNECTIONS", {}).get("SERVICE_CONNECTION", {})
        agent_app_id = connection.get("SETTINGS", {}).get("CLIENTID", "")
        try:
            await adapter.continue_conversation(agent_app_id, continuation, send)
        except Exception:
            reminders.pop(reminder.id, None)
            logger.exception("Failed to deliver reminder %s", reminder.id)
            return
        reminders.pop(reminder.id, None)

    async def create_reminder(context: TurnContext, command: str) -> None:
        parsed = _parse_reminder(context, command)
        if parsed is None:
            await send_private(context, "Could not parse time. Use a positive delay such as 'in 5 minutes', 'in 1 hour', or 'in 30 seconds'.\n\nUse `reminder-help` for examples.")
            return
        activity = context.activity
        sender = activity.from_property
        if not parsed["target_id"]:
            await send_private(context, "Could not determine who to remind. Use `remind me` or mention someone.")
            return
        from microsoft_agents.hosting.core.app.proactive import Conversation

        conversation = Conversation.from_turn_context(context)
        conv_id = (activity.conversation.id if activity.conversation else "").split(";")[0]
        conversation.conversation_reference.conversation.id = conv_id
        identifier = reminder_id(context)
        reminder = Reminder(
            id=identifier,
            conversation_id=conv_id,
            conversation=conversation,
            target_user_id=parsed["target_id"],
            target_user_name=parsed["target_name"],
            creator_id=sender.id if sender else "",
            creator_name=sender.name if sender else "Someone",
            text=parsed["text"],
            due_time=now() + parsed["delay"],
        )
        reminders[identifier] = reminder

        async def callback() -> None:
            await deliver(reminder)

        reminder.cancel_timer = schedule(callback, parsed["delay"])
        target = "yourself" if reminder.creator_id == reminder.target_user_id else reminder.target_user_name
        card = _card("Reminder Set!", [
            {"type": "FactSet", "facts": [
                {"title": "Reminder:", "value": reminder.text},
                {"title": "For:", "value": target},
                {"title": "In:", "value": _format_time_span(parsed["delay"])},
                {"title": "ID:", "value": reminder.id},
            ]},
            {"type": "TextBlock", "text": "This is a targeted message — only you can see this.", "isSubtle": True, "wrap": True},
        ], [{"type": "Action.Execute", "title": "Cancel Reminder", "verb": "cancel_reminder",
             "data": {"action": "cancel_reminder", "reminderId": reminder.id}}])
        await send_private(context, attachments=[card])

    async def show_help(context: TurnContext) -> None:
        text = (
            "**Personal Reminder Agent - Help**\n\n"
            "**Set a Reminder:**\n"
            "- `remind me in 5 minutes to check email`\n"
            "- `remind me in 1 hour meeting starts`\n"
            "- `remind me in 30 seconds test`\n"
            "- `remind @John in 10 minutes review PR`\n\n"
            "**Supported Time Formats:** seconds (`30 seconds`, `30 secs`, `30s`), "
            "minutes (`5 minutes`, `5 mins`, `5m`), and hours (`1 hour`, `2 hrs`, `1h`).\n\n"
            "**Manage Reminders:** `my-reminders`, `cancel-reminder [id]`, and `reminder-help` (`help` is an alias).\n\n"
            "Reminders are private targeted messages in channels and group chats. You can set reminders for yourself or mention someone, then dismiss or snooze them with card buttons.\n\n"
            "**Reactions:** `add-reaction [type]` and `remove-reaction [type]` work by mentioning the agent in a regular message, not via slash commands."
            "\n\nSupported reaction types include `like`, `heart`, `1f440_eyes`, "
            "`2705_whiteheavycheckmark`, `launch`, and `1f4cc_pushpin`."
        )
        sender = context.activity.from_property
        await send_private(context, text, suggestions=_suggestions(
            sender.id if sender else None,
            ("Set a 30-second test reminder", "remind me in 30 seconds test"),
            ("Set a 5-minute reminder", "remind me in 5 minutes check email"),
            ("My reminders", "my-reminders"),
        ))

    async def show_reminders(context: TurnContext) -> None:
        sender = context.activity.from_property
        user_id = sender.id if sender else ""
        owned = sorted(
            (r for r in reminders.values() if r.target_user_id == user_id or r.creator_id == user_id),
            key=lambda r: r.due_time,
        )
        if not owned:
            await send_private(context, "You have no active reminders.", suggestions=_suggestions(
                user_id,
                ("Remind me in 5 minutes test", "remind me in 5 minutes test"),
                ("Remind me in 1 hour meeting", "remind me in 1 hour meeting"),
                ("Show help", "reminder-help"),
            ))
            return
        lines = []
        for item in owned:
            remaining = item.due_time - now()
            target = "yourself" if item.creator_id == item.target_user_id else item.target_user_name
            time_left = f"in {_format_time_span(remaining)}" if remaining > 0 else "overdue"
            lines.append(f'- **{item.id}**: "{item.text}" for {target} ({time_left})')
        await send_private(
            context,
            "**Your Active Reminders:**\n\n" + "\n".join(lines)
            + "\n\nUse `cancel-reminder [id]` to cancel a reminder.",
        )

    async def handle_message(context: TurnContext, _state: TurnState) -> None:
        activity = context.activity
        if not activity.text:
            return
        is_targeted = _is_targeted(activity)
        text = _strip_mention(activity.text, activity).strip()
        quote = re.search(r'<quoted\s+messageId="([^"]+)"\s*/>', text)
        quoted_id = quote.group(1) if quote else None
        if quote:
            text = text.replace(quote.group(0), "").strip()
        lower = text.lower()
        if lower in ("reminder-help", "help"):
            await show_help(context)
        elif lower.startswith("remind"):
            await create_reminder(context, text)
        elif lower == "my-reminders":
            await show_reminders(context)
        elif lower.startswith("cancel-reminder"):
            identifier = re.sub(r"^cancel-reminder\s*", "", text, flags=re.IGNORECASE).strip()
            sender = activity.from_property
            user_id = sender.id if sender else ""
            reminder = reminders.get(identifier)
            if not identifier:
                response = "Please specify a reminder ID. Use `my-reminders` to see your active reminders."
            elif reminder is None:
                response = f"Reminder **{identifier}** not found or already completed."
            elif user_id not in (reminder.creator_id, reminder.target_user_id):
                response = "You can only cancel reminders you created or are assigned to you."
            else:
                if reminder.cancel_timer:
                    reminder.cancel_timer()
                reminders.pop(identifier, None)
                response = f"Reminder **{identifier}** has been cancelled."
            await send_private(context, response)
        elif lower.startswith(("add-reaction", "remove-reaction")):
            operation = "add" if lower.startswith("add-reaction") else "delete"
            prefix = "add-reaction" if operation == "add" else "remove-reaction"
            reaction_type = re.sub(rf"^{prefix}\s*", "", text, flags=re.IGNORECASE).strip()
            if not reaction_type:
                await send_private(context, f"Please specify a reaction type. Example: `{prefix} like`")
            elif is_targeted:
                await send_private(context, f"Reactions cannot be {'added' if operation == 'add' else 'removed'} via slash commands. Please use `{prefix}` by @mentioning the agent in a regular message.")
            else:
                message_id = quoted_id or getattr(activity, "reply_to_id", None) or activity.id
                if reaction is not None:
                    await reaction(context, operation, message_id, reaction_type)
                else:
                    api = teams.get_teams_api_client(context)
                    if operation == "add":
                        await api.reactions.add(activity.conversation.id, message_id, reaction_type)
                    else:
                        await api.reactions.delete(activity.conversation.id, message_id, reaction_type)
                await context.send_activity(
                    f"{'Added' if operation == 'add' else 'Removed'} a **{reaction_type}** reaction "
                    f"{'to' if operation == 'add' else 'from'} your message!"
                )
        else:
            await send_private(
                context,
                "Use `reminder-help` to see available commands.",
                suggestions=_suggestions(
                    activity.from_property.id if activity.from_property else None,
                    ("Show help", "reminder-help"),
                    ("Remind me in 5 minutes test", "remind me in 5 minutes test"),
                    ("My reminders", "my-reminders"),
                ),
                ai_generated=True,
            )

    async def handle_invoke(context: TurnContext, _state: TurnState) -> None:
        activity = context.activity
        name = activity.name
        value = _activity_dict(activity.value)
        response_text = "Unknown action."
        if name == "suggestedActions/submit":
            command = value.get("command")
            if not command:
                response_text = "No command specified."
            else:
                lower = command.lower()
                if lower in ("reminder-help", "help"):
                    await show_help(context)
                elif lower.startswith("remind"):
                    await create_reminder(context, command)
                elif lower == "my-reminders":
                    await show_reminders(context)
                else:
                    await context.send_activity(f"Executing: {command}")
            await context.send_activity(Activity(type="invokeResponse", value={"status": 200, "body": {"message": response_text}}))
            return
        if name == "adaptiveCard/action":
            action_data = value.get("action") or {}
            data = action_data.get("data") or {}
            action = data.get("action") or action_data.get("verb")
            identifier = data.get("reminderId")
            reminder = reminders.get(identifier) if identifier else None
            if action == "cancel_reminder":
                if reminder:
                    if reminder.cancel_timer:
                        reminder.cancel_timer()
                    reminders.pop(reminder.id, None)
                    response_text = "Reminder cancelled!"
                else:
                    response_text = "Reminder not found or already completed."
            elif action == "dismiss_reminder":
                if reminder:
                    if reminder.cancel_timer:
                        reminder.cancel_timer()
                    reminders.pop(reminder.id, None)
                response_text = "Reminder dismissed!"
            elif action == "snooze_reminder":
                sender = activity.from_property
                minutes = int(data.get("snoozeMinutes") or "5")
                if reminder:
                    if reminder.cancel_timer:
                        reminder.cancel_timer()
                    reminders.pop(reminder.id, None)
                target_id = sender.id if sender else ""
                target_name = sender.name if sender else "User"
                from microsoft_agents.hosting.core.app.proactive import Conversation
                conversation = Conversation.from_turn_context(context)
                conv_id = (activity.conversation.id if activity.conversation else "").split(";")[0]
                conversation.conversation_reference.conversation.id = conv_id
                new = Reminder(
                    reminder_id(context), conv_id, conversation, target_id, target_name,
                    target_id, target_name, data.get("reminderText") or "Snoozed reminder",
                    now() + minutes * 60,
                )
                reminders[new.id] = new

                async def callback() -> None:
                    await deliver(new)

                new.cancel_timer = schedule(callback, minutes * 60)
                card = _card("Snoozed!", [
                    {"type": "TextBlock", "text": new.text, "wrap": True},
                    {"type": "TextBlock", "text": f"Will remind you again in {minutes} minutes.", "isSubtle": True},
                ], [{"type": "Action.Execute", "title": "Cancel", "verb": "cancel_reminder",
                     "data": {"action": "cancel_reminder", "reminderId": new.id}}])
                await send_private(context, f"Snoozed for {minutes} minutes", attachments=[card])
                response_text = f"Snoozed for {minutes} minutes!"
            await context.send_activity(Activity(type="invokeResponse", value={"status": 200, "body": {"message": response_text}}))
            return
        await context.send_activity(Activity(type="invokeResponse", value={"status": 200, "body": {"message": response_text}}))

    async def handle_reaction_event(context: TurnContext, _state: TurnState) -> None:
        activity = context.activity
        for reaction_item in getattr(activity, "reactions_added", None) or []:
            user = getattr(reaction_item, "user", None)
            user_name = getattr(user, "display_name", None) or "Someone"
            reaction_type = getattr(reaction_item, "type", "unknown")
            await context.send_activity(f"Thanks for the **{reaction_type}** reaction, {user_name}!")
        for reaction_item in getattr(activity, "reactions_removed", None) or []:
            user = getattr(reaction_item, "user", None)
            user_name = getattr(user, "display_name", None) or "Someone"
            reaction_type = getattr(reaction_item, "type", "unknown")
            await context.send_activity(f"Noted! {user_name} removed their **{reaction_type}** reaction.")

    @app.activity("message")
    async def on_message(context: TurnContext, state: TurnState) -> None:
        await handle_message(context, state)

    @app.activity("invoke")
    async def on_invoke(context: TurnContext, state: TurnState) -> None:
        await handle_invoke(context, state)

    @app.activity("messageReaction")
    async def on_reaction(context: TurnContext, state: TurnState) -> None:
        await handle_reaction_event(context, state)

    return app
