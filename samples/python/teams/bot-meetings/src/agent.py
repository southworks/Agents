"""Teams meeting agent with injectable Teams and Graph services."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping, MutableMapping
from datetime import datetime, timezone
from os import environ
from typing import Any

from azure.identity.aio import ClientSecretCredential
from dotenv import load_dotenv
from microsoft_agents.activity import Attachment, load_configuration_from_env
from microsoft_agents.authentication.msal import MsalConnectionManager
from microsoft_agents.hosting.aiohttp import CloudAdapter
from microsoft_agents.hosting.core import AgentApplication, MemoryStorage, MessageFactory
from microsoft_agents.hosting.msteams import TeamsAgentExtension
from msgraph import GraphServiceClient

from .transcripts import get_meeting_transcript, parse_vtt

load_dotenv()

GRAPH_API_BASE_URL = "https://graph.microsoft.com/beta"
GRAPH_SCOPES = ["https://graph.microsoft.com/.default"]


def _normalize_meeting_activity(activity: Any) -> None:
    event_name = _value(activity, "name", default="")
    required_value_fields = {
        "application/vnd.microsoft.meetingStart": ("Id", "MeetingType"),
        "application/vnd.microsoft.meetingEnd": (
            "Id",
            "MeetingType",
            "JoinUrl",
            "Title",
            "EndTime",
        ),
    }
    fields = required_value_fields.get(event_name)
    if fields:
        value = _value(activity, "value")
        if isinstance(value, MutableMapping):
            for field in fields:
                if field not in value:
                    value[field] = (
                        datetime.now(timezone.utc)
                        if field == "EndTime"
                        else ""
                    )

    channel_data = _value(activity, "channel_data")
    meeting = _value(channel_data, "meeting")
    details = _value(meeting, "details")
    if isinstance(details, MutableMapping):
        meeting_id = _value(meeting, "id", default="")
        details.setdefault("id", meeting_id)
        for field in ("type", "joinUrl", "title"):
            details.setdefault(field, "")


def _value(source: Any, *names: str, default: Any = None) -> Any:
    if isinstance(source, Mapping):
        for name in names:
            if name in source:
                return source[name]
    for name in names:
        if hasattr(source, name):
            return getattr(source, name)
    return default


def _card(body: list[dict[str, Any]], actions: list[dict[str, Any]] | None = None):
    content: dict[str, Any] = {
        "type": "AdaptiveCard",
        "version": "1.5",
        "body": body,
    }
    if actions:
        content["actions"] = actions
    return MessageFactory.attachment(
        Attachment(
            content_type="application/vnd.microsoft.card.adaptive",
            content=content,
        )
    )


def _graph_client() -> GraphServiceClient:
    credential = ClientSecretCredential(
        tenant_id=environ.get(
            "CONNECTIONS__SERVICE_CONNECTION__SETTINGS__TENANTID", ""
        ),
        client_id=environ.get(
            "CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTID", ""
        ),
        client_secret=environ.get(
            "CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTSECRET", ""
        ),
    )
    return GraphServiceClient(
        credentials=credential,
        scopes=GRAPH_SCOPES,
        base_url=GRAPH_API_BASE_URL,
    )


def create_agent(dependencies: Mapping[str, Any] | None = None) -> AgentApplication:
    deps = dependencies or {}
    configuration = load_configuration_from_env(environ)
    connection_manager = deps.get("connection_manager")
    if connection_manager is None:
        connection_manager = MsalConnectionManager(**configuration)
    adapter = deps.get("adapter")
    if adapter is None:
        adapter = CloudAdapter(connection_manager=connection_manager)

    app = AgentApplication(
        storage=MemoryStorage(),
        adapter=adapter,
        connection_manager=connection_manager,
    )
    sdk_on_turn = app.on_turn

    async def on_turn(context: Any) -> None:
        _normalize_meeting_activity(context.activity)
        await sdk_on_turn(context)

    app.on_turn = on_turn
    teams = TeamsAgentExtension(app)

    meeting_info = deps.get("meeting_info")
    transcript = deps.get("transcript")
    wait = deps.get("wait", asyncio.sleep)
    graph_client: GraphServiceClient | None = None

    async def get_meeting_info(context: Any, meeting_id: str) -> Any:
        if meeting_info is not None:
            return await meeting_info(context, meeting_id)
        client = teams.get_teams_api_client(context)
        return await client.meetings.get_by_id(meeting_id)

    async def get_transcript(context: Any, resource_id: str, user_id: str) -> str:
        nonlocal graph_client
        if transcript is not None:
            return await transcript(context, resource_id, user_id)
        if graph_client is None:
            graph_client = _graph_client()
        return await get_meeting_transcript(graph_client, resource_id, user_id)

    @teams.meetings.start
    async def on_meeting_start(context: Any, _state: Any, _event: Any = None) -> None:
        value = context.activity.value
        title = _value(value, "Title", "title", default="N/A")
        start_time = _value(value, "StartTime", "start_time", default="N/A")
        join_url = _value(value, "JoinUrl", "join_url")
        actions = (
            [{"type": "Action.OpenUrl", "title": "Join Meeting", "url": join_url}]
            if join_url
            else []
        )
        await context.send_activity(
            _card(
                [
                    {
                        "type": "TextBlock",
                        "text": "The meeting has started.",
                        "weight": "Bolder",
                        "size": "Large",
                        "wrap": True,
                    },
                    {"type": "TextBlock", "text": f"**Title:** {title}", "wrap": True},
                    {
                        "type": "TextBlock",
                        "text": f"**Start Time:** {start_time}",
                        "wrap": True,
                    },
                ],
                actions,
            )
        )

    @teams.meetings.end
    async def on_meeting_end(context: Any, _state: Any, _event: Any = None) -> None:
        value = context.activity.value
        meeting = _value(context.activity.channel_data, "meeting", default={})
        meeting_id = _value(meeting, "id")
        details = _value(meeting, "details", default={})
        resource_id = _value(details, "ms_graph_resource_id", "msGraphResourceId")
        organizer_id = ""

        if meeting_id:
            info = await get_meeting_info(context, meeting_id)
            organizer = _value(info, "organizer")
            organizer_id = _value(organizer, "aadObjectId", "aad_object_id", default="") or ""
            if not resource_id:
                info_details = _value(info, "details")
                resource_id = _value(
                    info_details, "ms_graph_resource_id", "msGraphResourceId"
                )

        transcript_text = ""
        await wait(30)
        if resource_id:
            for attempt in range(3):
                vtt = await get_transcript(context, resource_id, organizer_id)
                if vtt:
                    transcript_text = parse_vtt(vtt)
                    if transcript_text:
                        break
                if attempt < 2:
                    await wait(10)

        transcript_lines = (
            transcript_text.splitlines()
            if transcript_text
            else ["Transcript not available for this meeting."]
        )
        end_time = _value(value, "EndTime", "end_time", default="")
        await context.send_activity(
            _card(
                [
                    {
                        "type": "TextBlock",
                        "text": "The meeting has ended.",
                        "weight": "Bolder",
                        "size": "Large",
                        "wrap": True,
                    },
                    {"type": "TextBlock", "text": f"**End Time:** {end_time}", "wrap": True},
                    {
                        "type": "TextBlock",
                        "text": "**Transcript:**",
                        "weight": "Bolder",
                        "wrap": True,
                    },
                    *[
                        {"type": "TextBlock", "text": line, "wrap": True}
                        for line in transcript_lines
                        if line
                    ],
                ]
            )
        )

    async def send_participant_event(
        context: Any, event_label: str
    ) -> None:
        value = context.activity.value
        members = _value(value, "members", default=[]) or []
        participant = members[0] if members else None
        user = _value(participant, "user")
        if not _value(user, "aadObjectId", "aad_object_id"):
            return
        name = _value(user, "name", default="A participant") or "A participant"
        message = f"{name} has {event_label} the meeting"
        role = _value(_value(participant, "meeting"), "role")
        if event_label == "joined":
            message += f" as {role or 'a participant'}"
        message += "."
        await context.send_activity(
            _card(
                [
                    {
                        "type": "TextBlock",
                        "text": message,
                        "wrap": True,
                        "weight": "Bolder",
                    }
                ]
            )
        )

    @teams.meetings.participants_join
    async def on_participant_join(
        context: Any, _state: Any, _event: Any = None
    ) -> None:
        await send_participant_event(context, "joined")

    @teams.meetings.participants_leave
    async def on_participant_leave(
        context: Any, _state: Any, _event: Any = None
    ) -> None:
        await send_participant_event(context, "left")

    return app
