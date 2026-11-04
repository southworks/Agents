"""Message-extension search, unfurl and fallback contracts through SDK invokes."""

import json
import unittest
from unittest.mock import AsyncMock

from harness import dispatch, invoke_response, sample_application


async def query(app, command="wikipediaSearch", text="computers"):
    sent = await dispatch(app, {
        "type": "invoke", "name": "composeExtension/query",
        "value": {"commandId": command, "parameters": [{"name": "query", "value": text}]},
    })
    response = invoke_response(sent)
    if response["status"] != 200:
        raise AssertionError("Query invoke must return HTTP 200")
    return response["body"]["composeExtension"]


class MessageExtensionContracts(unittest.IsolatedAsyncioTestCase):
    async def test_search_cards_sanitize_snippets_and_preserve_previews(self):
        search = AsyncMock(return_value=[{
            "title": "Computer science", "snippet": "<b>Computing</b> history",
        }])
        app = sample_application({"search_wikipedia": search})
        extension = await query(app)
        search.assert_awaited_once_with("computers")
        self.assertEqual(extension["type"], "result")
        self.assertEqual(extension["attachmentLayout"], "list")
        attachment = extension["attachments"][0]
        self.assertEqual(attachment["contentType"], "application/vnd.microsoft.card.adaptive")
        self.assertEqual(attachment["content"]["body"][1]["text"], "Computing history")
        self.assertEqual(attachment["preview"]["content"]["title"], "Computer science")
        self.assertNotIn("<b>", attachment["preview"]["content"]["text"])
        self.assertIn("https://en.wikipedia.org/wiki/Computer_science", json.dumps(attachment["content"]))

    async def test_empty_results_and_unknown_commands_return_no_results(self):
        search = AsyncMock(return_value=[])
        app = sample_application({"search_wikipedia": search})
        for command in ("wikipediaSearch", "unknown-command"):
            with self.subTest(command=command):
                extension = await query(app, command, "no matches")
                self.assertEqual(extension, {
                    "type": "message", "text": "No results found for 'no matches'",
                })

    async def test_unfurl_preserves_requested_url(self):
        app = sample_application()
        url = "https://en.wikipedia.org/wiki/Computer_science"
        sent = await dispatch(app, {
            "type": "invoke", "name": "composeExtension/queryLink", "value": {"url": url},
        })
        response = invoke_response(sent)
        self.assertEqual(response["status"], 200)
        attachment = response["body"]["composeExtension"]["attachments"][0]
        self.assertEqual(attachment["content"]["body"][0]["text"], "Link Preview")
        self.assertIn(url, attachment["content"]["body"][1]["text"])

    async def test_help_explains_compose_search_and_echo_remains_useful(self):
        app = sample_application()
        help_messages = await dispatch(app, {"text": "HELP"})
        self.assertRegex(help_messages[0]["text"], r"compose area.*Wikipedia")
        self.assertNotIn("Extension Bot", help_messages[0]["text"])
        echo = await dispatch(app, {"text": "Hello"})
        self.assertIn("You said: Hello", echo[0]["text"])
