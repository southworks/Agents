"""Teams attachment handling for the Microsoft 365 Agents SDK."""

import asyncio
import logging
import uuid
from collections.abc import Mapping
from os import environ
from typing import Any

from dotenv import load_dotenv
from microsoft_agents.activity import Activity, Attachment, load_configuration_from_env
from microsoft_agents.authentication.msal import MsalConnectionManager
from microsoft_agents.hosting.aiohttp import CloudAdapter
from microsoft_agents.hosting.core import AgentApplication, MemoryStorage, TurnContext
from microsoft_agents.hosting.core.app import ApplicationOptions, ProactiveOptions
from microsoft_agents.hosting.core.app.proactive import Conversation
from microsoft_agents.hosting.msteams import TeamsAgentExtension

from .files import (
    MAX_ATTACHMENT_SIZE_BYTES,
    AttachmentTooLargeError,
    download_attachment,
    upload_to_onedrive,
)

logger = logging.getLogger(__name__)

MAX_PENDING_UPLOADS = 5
PENDING_UPLOAD_TTL_SECONDS = 15 * 60
CONTENT_TYPE_FILE_DOWNLOAD = "application/vnd.microsoft.teams.file.download.info"
CONTENT_TYPE_FILE_CONSENT = "application/vnd.microsoft.teams.card.file.consent"
CONTENT_TYPE_FILE_INFO = "application/vnd.microsoft.teams.card.file.info"
WELCOME_MESSAGE = (
    "Welcome to the Agent Attachments sample! Please attach a file or image "
    "to save to your OneDrive."
)


def _read(value: Any, name: str, alias: str | None = None, default: Any = None) -> Any:
    if isinstance(value, Mapping):
        return value.get(name, value.get(alias, default) if alias else default)
    return getattr(value, name, getattr(value, alias, default) if alias else default)


def _agent_configuration() -> dict[str, Any]:
    configuration = load_configuration_from_env(environ)
    for connection in configuration.get("CONNECTIONS", {}).values():
        settings = connection.get("SETTINGS", {})
        scopes = settings.get("SCOPES")
        if isinstance(scopes, dict):
            settings["SCOPES"] = [scopes[key] for key in sorted(scopes, key=int)]
    return configuration


def create_agent(dependencies: Mapping[str, Any] | None = None) -> AgentApplication:
    """Create an isolated agent; dependencies allow offline transport checks."""
    load_dotenv()
    deps = dependencies or {}
    configuration = _agent_configuration()
    storage = MemoryStorage()
    connection_manager = deps.get("connection_manager")
    if connection_manager is None:
        connection_manager = MsalConnectionManager(**configuration)
    adapter = deps.get("adapter")
    if adapter is None:
        adapter = CloudAdapter(connection_manager=connection_manager)

    app = AgentApplication(
        options=ApplicationOptions(
            storage=storage,
            adapter=adapter,
            proactive=ProactiveOptions(storage=storage),
        ),
        connection_manager=connection_manager,
    )
    app.pending_uploads = {}
    app.pending_expirations = {}
    app.uploading_ids = set()
    app.upload_tasks = set()

    def remove_pending_upload(file_id: str) -> None:
        app.pending_uploads.pop(file_id, None)
        expiration = app.pending_expirations.pop(file_id, None)
        if expiration is not None:
            expiration.cancel()

    def expire_pending_upload(file_id: str) -> None:
        app.pending_expirations.pop(file_id, None)
        if file_id not in app.uploading_ids:
            app.pending_uploads.pop(file_id, None)

    def schedule_pending_expiration(file_id: str) -> None:
        app.pending_expirations[file_id] = asyncio.get_running_loop().call_later(
            PENDING_UPLOAD_TTL_SECONDS, expire_pending_upload, file_id
        )

    async def wait_for_uploads() -> None:
        while app.upload_tasks:
            await asyncio.gather(*tuple(app.upload_tasks))

    async def close_background_tasks() -> None:
        await wait_for_uploads()
        for expiration in app.pending_expirations.values():
            expiration.cancel()
        app.pending_expirations.clear()
        app.pending_uploads.clear()
        app.uploading_ids.clear()

    app.wait_for_uploads = wait_for_uploads
    app.close_background_tasks = close_background_tasks
    teams = TeamsAgentExtension(app)
    download = deps.get("download", download_attachment)
    upload = deps.get("upload", upload_to_onedrive)

    async def handle_message(context: TurnContext, _state: Any) -> None:
        attachment = next(iter(context.activity.attachments or []), None)
        if attachment is None or attachment.content_type != CONTENT_TYPE_FILE_DOWNLOAD:
            await context.send_activity(WELCOME_MESSAGE)
            return

        content_data = attachment.content
        url = _read(content_data, "downloadUrl")
        if len(app.pending_uploads) >= MAX_PENDING_UPLOADS:
            await context.send_activity(
                "Please finish or decline a pending upload before attaching another file."
            )
            return

        filename = attachment.name or f"image_{uuid.uuid4()}.png"
        file_id = str(uuid.uuid4())
        app.pending_uploads[file_id] = None
        try:
            content = await download(url)
            if len(content) > MAX_ATTACHMENT_SIZE_BYTES:
                raise AttachmentTooLargeError(
                    "Attachment exceeds the maximum supported size"
                )
        except AttachmentTooLargeError:
            remove_pending_upload(file_id)
            await context.send_activity(
                "Attachments must be 20 MiB or smaller."
            )
            return
        except asyncio.CancelledError:
            remove_pending_upload(file_id)
            raise
        except Exception:
            remove_pending_upload(file_id)
            logger.exception("Failed to download Teams attachment")
            await context.send_activity(WELCOME_MESSAGE)
            return

        app.pending_uploads[file_id] = content
        consent_context = {"filename": filename, "file_id": file_id}
        card = Attachment(
            content_type=CONTENT_TYPE_FILE_CONSENT,
            name=filename,
            content={
                "description": "This is the file I want to send you",
                "sizeInBytes": len(content),
                "acceptContext": consent_context,
                "declineContext": consent_context,
            },
        )
        consent_sent = False
        try:
            await context.send_activity(
                f"Received <b>{filename}</b>. Requesting permission to save to your OneDrive..."
            )
            await context.send_activity(Activity(type="message", attachments=[card]))
            consent_sent = True
        finally:
            if not consent_sent:
                remove_pending_upload(file_id)
        schedule_pending_expiration(file_id)

    @app.activity("message")
    async def on_message(context: TurnContext, state: Any) -> None:
        await handle_message(context, state)

    async def upload_and_send(
        context: TurnContext, upload_info: Any, file_id: str
    ) -> None:
        content = app.pending_uploads.get(file_id)
        if content is None:
            logger.warning("No pending attachment found for consent id %s", file_id)
            return

        try:
            upload_url = _read(upload_info, "upload_url", "uploadUrl")
            try:
                await upload(upload_url, content)
                file_info = Attachment(
                    content_type=CONTENT_TYPE_FILE_INFO,
                    name=_read(upload_info, "name"),
                    content_url=_read(upload_info, "content_url", "contentUrl"),
                    content={
                        "uniqueId": _read(upload_info, "unique_id", "uniqueId"),
                        "fileType": _read(upload_info, "file_type", "fileType"),
                    },
                )
                result = Activity(
                    type="message",
                    text=f"<b>{_read(upload_info, 'name')}</b> has been successfully uploaded.",
                    attachments=[file_info],
                )
            except Exception:
                logger.exception("File upload failed")
                return

            conversation = Conversation.from_turn_context(context)

            async def send_result(continuation_context: TurnContext) -> None:
                await continuation_context.send_activity(result)

            agent_id = (
                context.activity.recipient.id if context.activity.recipient else None
            )
            if not agent_id:
                logger.error("Cannot send file upload confirmation without an agent ID")
                return
            continuation = (
                conversation.conversation_reference.get_continuation_activity()
            )
            try:
                await adapter.continue_conversation(
                    agent_id, continuation, send_result
                )
            except Exception:
                logger.exception("Could not send file upload confirmation")
        finally:
            remove_pending_upload(file_id)
            app.uploading_ids.discard(file_id)

    async def accept_consent(
        context: TurnContext, _state: Any, payload: Any
    ) -> None:
        value = context.activity.value
        consent_context = _read(value, "context", default={}) or {}
        file_id = _read(consent_context, "file_id", "fileId")
        filename = _read(consent_context, "filename", default="file")
        upload_info = _read(value, "upload_info", "uploadInfo")
        if (
            not file_id
            or file_id not in app.pending_uploads
            or app.pending_uploads[file_id] is None
            or file_id in app.uploading_ids
            or upload_info is None
        ):
            logger.warning("Ignoring invalid or repeated file consent acceptance")
            return
        app.uploading_ids.add(file_id)
        expiration = app.pending_expirations.pop(file_id, None)
        if expiration is not None:
            expiration.cancel()
        try:
            await context.send_activity(f"Accepted. Uploading <b>{filename}</b>...")
        except asyncio.CancelledError:
            app.uploading_ids.discard(file_id)
            schedule_pending_expiration(file_id)
            raise
        except Exception:
            app.uploading_ids.discard(file_id)
            schedule_pending_expiration(file_id)
            raise
        task = asyncio.create_task(upload_and_send(context, upload_info, file_id))
        app.upload_tasks.add(task)
        task.add_done_callback(app.upload_tasks.discard)

    async def decline_consent(
        context: TurnContext, _state: Any, payload: Any
    ) -> None:
        value = context.activity.value
        consent_context = _read(value, "context", default={}) or {}
        file_id = _read(consent_context, "file_id", "fileId")
        filename = _read(consent_context, "filename", default="file")
        if file_id and file_id not in app.uploading_ids:
            remove_pending_upload(file_id)
        await context.send_activity(
            f"Declined. We won't upload file <b>{filename}</b>."
        )

    @teams.file_consent.accept()
    async def on_file_consent_accept(
        context: TurnContext, state: Any, payload: Any
    ) -> None:
        await accept_consent(context, state, payload)

    @teams.file_consent.decline()
    async def on_file_consent_decline(
        context: TurnContext, state: Any, payload: Any
    ) -> None:
        await decline_consent(context, state, payload)

    return app


load_dotenv()
