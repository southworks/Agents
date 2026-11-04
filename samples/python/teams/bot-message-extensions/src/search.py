import logging
import re
from typing import Any
from urllib.parse import urlencode

import httpx


logger = logging.getLogger(__name__)


async def search_wikipedia(query: str) -> list[dict[str, Any]]:
    if not query:
        return []

    parameters = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "utf8": 1,
        "srlimit": 8,
    }
    url = f"https://en.wikipedia.org/w/api.php?{urlencode(parameters)}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                url,
                headers={
                    "User-Agent": "AgentMessageExtensions/1.0 (+https://example.com)"
                },
            )
            response.raise_for_status()
            results = response.json().get("query", {}).get("search", [])
    except (httpx.HTTPError, ValueError):
        logger.warning("Wikipedia search failed", exc_info=True)
        return []

    return [
        {
            **result,
            "snippet": re.sub(r"<[^>]+>", "", result.get("snippet") or ""),
        }
        for result in results[:8]
    ]
