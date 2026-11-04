"""HTTP helpers for downloading Teams attachments and uploading to OneDrive."""

import aiohttp

MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024


class AttachmentTooLargeError(ValueError):
    """Raised when a Teams attachment exceeds the supported size."""


async def download_attachment(url: str) -> bytes:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            if response.status != 200:
                raise RuntimeError(
                    f"Download failed with status {response.status}"
                )
            if (
                response.content_length is not None
                and response.content_length > MAX_ATTACHMENT_SIZE_BYTES
            ):
                raise AttachmentTooLargeError("Attachment exceeds the maximum supported size")

            chunks = []
            size = 0
            async for chunk in response.content.iter_chunked(64 * 1024):
                size += len(chunk)
                if size > MAX_ATTACHMENT_SIZE_BYTES:
                    raise AttachmentTooLargeError(
                        "Attachment exceeds the maximum supported size"
                    )
                chunks.append(chunk)
            return b"".join(chunks)


async def upload_to_onedrive(url: str, content: bytes) -> None:
    file_size = len(content)
    headers = {
        "Content-Type": "application/octet-stream",
        "Content-Length": str(file_size),
        "Content-Range": f"bytes 0-{file_size - 1}/{file_size}",
    }
    async with aiohttp.ClientSession() as session:
        async with session.put(url, data=content, headers=headers) as response:
            if response.status not in (200, 201):
                raise RuntimeError(f"Upload failed with status {response.status}")
