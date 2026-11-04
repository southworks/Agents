"""Microsoft Graph transcript retrieval and WebVTT formatting."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

from kiota_abstractions.base_request_configuration import RequestConfiguration


def _created_time(transcript: Any) -> datetime:
    value = getattr(transcript, "created_date_time", None)
    if isinstance(value, datetime):
        return value.replace(tzinfo=value.tzinfo or timezone.utc)
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc)
    return datetime.min.replace(tzinfo=timezone.utc)


async def get_meeting_transcript(
    graph_client: Any, resource_id: str, user_id: str
) -> str:
    base_url = graph_client.request_adapter.base_url.rstrip("/")
    transcript_path = (
        f"/users/{quote(user_id, safe='')}/onlineMeetings/"
        f"{quote(resource_id, safe='')}/transcripts"
    )
    metadata = await (
        graph_client.users.by_user_id(user_id)
        .online_meetings.by_online_meeting_id(resource_id)
        .transcripts.with_url(f"{base_url}{transcript_path}").get()
    )
    transcripts = getattr(metadata, "value", None) if metadata else None
    if not transcripts:
        return ""

    latest = max(transcripts, key=_created_time)
    transcript_id = getattr(latest, "id", None)
    if not transcript_id:
        return ""

    request_configuration = RequestConfiguration()
    request_configuration.headers.add("Accept", "text/vtt")
    content = await (
        graph_client.users.by_user_id(user_id)
        .online_meetings.by_online_meeting_id(resource_id)
        .transcripts.by_call_transcript_id(transcript_id)
        .content.with_url(
            f"{base_url}{transcript_path}/{quote(transcript_id, safe='')}/content"
        )
        .get(request_configuration=request_configuration)
    )
    if isinstance(content, bytes):
        return content.decode("utf-8")
    return content or ""


def parse_vtt(vtt: str) -> str:
    """Convert WebVTT speaker cues to readable transcript lines."""
    lines = []
    for line in vtt.splitlines():
        line = line.strip()
        if not line or line.startswith("WEBVTT") or "-->" in line:
            continue
        line = re.sub(r"<v ([^>]+)>", r"\1: ", line)
        line = re.sub(r"<[^>]+>", "", line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)
