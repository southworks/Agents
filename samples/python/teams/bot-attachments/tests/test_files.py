import unittest
from unittest.mock import patch

from src import files


class FakeContent:
    def __init__(self, chunks):
        self.chunks = chunks

    async def iter_chunked(self, size):
        self.chunk_size = size
        for chunk in self.chunks:
            yield chunk


class FakeResponse:
    status = 200

    def __init__(self, content_length, chunks):
        self.content_length = content_length
        self.content = FakeContent(chunks)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None


class FakeSession:
    def __init__(self, response):
        self.response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def get(self, _url):
        return self.response


class AttachmentDownloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_download_accepts_a_stream_at_the_size_limit(self):
        response = FakeResponse(5, [b"abc", b"de"])
        with (
            patch.object(files, "MAX_ATTACHMENT_SIZE_BYTES", 5),
            patch.object(files.aiohttp, "ClientSession", return_value=FakeSession(response)),
        ):
            content = await files.download_attachment("https://example.invalid/file")

        self.assertEqual(content, b"abcde")
        self.assertEqual(response.content.chunk_size, 64 * 1024)

    async def test_download_rejects_an_oversized_content_length(self):
        response = FakeResponse(6, [])
        with (
            patch.object(files, "MAX_ATTACHMENT_SIZE_BYTES", 5),
            patch.object(files.aiohttp, "ClientSession", return_value=FakeSession(response)),
        ):
            with self.assertRaises(files.AttachmentTooLargeError):
                await files.download_attachment("https://example.invalid/file")

    async def test_download_rejects_an_oversized_stream_without_content_length(self):
        response = FakeResponse(None, [b"1234", b"56"])
        with (
            patch.object(files, "MAX_ATTACHMENT_SIZE_BYTES", 5),
            patch.object(files.aiohttp, "ClientSession", return_value=FakeSession(response)),
        ):
            with self.assertRaises(files.AttachmentTooLargeError):
                await files.download_attachment("https://example.invalid/file")
