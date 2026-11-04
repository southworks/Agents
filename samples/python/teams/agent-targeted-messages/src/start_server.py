"""Authenticated aiohttp hosting for the targeted reminder agent."""

import asyncio
from os import environ

from aiohttp import web
from microsoft_agents.activity import load_configuration_from_env
from microsoft_agents.hosting.aiohttp import jwt_authorization_middleware, start_agent_process
from microsoft_agents.hosting.core import AgentApplication, AgentAuthConfiguration
from microsoft_agents.hosting.core.authorization import AuthTypes

from .agent import create_agent


def start_server() -> None:
    configuration = load_configuration_from_env(environ)
    connection = configuration.get("CONNECTIONS", {}).get("SERVICE_CONNECTION", {})
    settings = connection.get("SETTINGS", {})
    auth_configuration = AgentAuthConfiguration(
        client_id=settings.get("CLIENTID") or None,
        tenant_id=settings.get("TENANTID") or None,
        client_secret=settings.get("CLIENTSECRET") or None,
        auth_type=AuthTypes.client_secret,
        anonymous_allowed=False,
        validate_issuer=True,
        issuers=["https://api.botframework.com"],
    )
    agent: AgentApplication | None = None
    agent_lock = asyncio.Lock()

    async def get_agent() -> AgentApplication:
        nonlocal agent
        if agent is None:
            async with agent_lock:
                if agent is None:
                    agent = create_agent()
        return agent

    @web.middleware
    async def readiness_aware_auth(request: web.Request, handler):
        if request.method == "GET" and request.path == "/":
            return await handler(request)
        return await jwt_authorization_middleware(request, handler)

    async def ready(_request: web.Request) -> web.Response:
        return web.json_response({"status": "ready", "sample": "agent-targeted-messages"})

    async def messages(request: web.Request) -> web.Response:
        current_agent = await get_agent()
        response = await start_agent_process(request, current_agent, current_agent.adapter)
        return response or web.Response(status=202)

    async def cleanup(_application: web.Application) -> None:
        if agent is not None:
            await agent.close_background_tasks()

    application = web.Application(middlewares=[readiness_aware_auth])
    application.router.add_get("/", ready)
    application.router.add_post("/api/messages", messages)
    application["agent_configuration"] = auth_configuration
    application.on_cleanup.append(cleanup)
    web.run_app(application, host="localhost", port=int(environ.get("PORT", "3978")))
