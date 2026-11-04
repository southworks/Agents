"""aiohttp host for the Teams meeting agent."""

from os import environ
from collections.abc import Callable

from aiohttp import web
from microsoft_agents.hosting.aiohttp import (
    CloudAdapter,
    jwt_authorization_middleware,
    start_agent_process,
)
from microsoft_agents.activity import load_configuration_from_env
from microsoft_agents.hosting.core import AgentApplication


def create_server(agent_factory: Callable[[], AgentApplication]) -> web.Application:
    async def messages(request: web.Request) -> web.Response:
        current_agent = request.app["agent_app"]
        if current_agent is None:
            current_agent = agent_factory()
            request.app["agent_app"] = current_agent
            request.app["adapter"] = current_agent.adapter
        adapter: CloudAdapter = request.app["adapter"]
        return await start_agent_process(request, current_agent, adapter)

    @web.middleware
    async def authorize_messages(
        request: web.Request, handler
    ) -> web.StreamResponse:
        if request.method == "GET" and request.path == "/":
            return web.Response(text="Agent is ready.")
        if request.app["agent_configuration"] is None:
            request.app["agent_configuration"] = load_configuration_from_env(environ)
        return await jwt_authorization_middleware(request, handler)

    application = web.Application(middlewares=[authorize_messages])
    application.router.add_get("/", lambda _request: web.Response(text="Agent is ready."))
    application.router.add_post("/api/messages", messages)
    application["agent_configuration"] = None
    application["agent_app"] = None
    application["adapter"] = None
    return application


def start_server(agent_factory: Callable[[], AgentApplication]) -> None:
    web.run_app(
        create_server(agent_factory),
        host="localhost",
        port=int(environ.get("PORT", "3978")),
    )
