"""aiohttp hosting with credential-free readiness and protected messages."""

from os import environ
from collections.abc import Callable

from aiohttp import web
from microsoft_agents.hosting.aiohttp import (
    jwt_authorization_middleware,
    start_agent_process,
)
from microsoft_agents.hosting.core import AgentApplication

AgentFactory = Callable[[], AgentApplication]


def create_server(agent_factory: AgentFactory) -> web.Application:
    async def initialize_agent(application: web.Application) -> None:
        if "agent_app" in application:
            return
        agent_application = agent_factory()
        connection_manager = agent_application.connection_manager
        application["agent_configuration"] = (
            connection_manager.get_default_connection_configuration()
        )
        application["agent_app"] = agent_application
        application["adapter"] = agent_application.adapter

    @web.middleware
    async def authorize(
        request: web.Request, handler: Callable[[web.Request], web.StreamResponse]
    ) -> web.StreamResponse:
        if request.method == "GET" and request.path == "/":
            return await handler(request)
        await initialize_agent(request.app)
        return await jwt_authorization_middleware(request, handler)

    async def readiness(_request: web.Request) -> web.Response:
        return web.json_response({"status": "ready"})

    async def messages(request: web.Request) -> web.Response:
        agent_application: AgentApplication = request.app["agent_app"]
        response = await start_agent_process(
            request, agent_application, request.app["adapter"]
        )
        return response or web.Response(status=202)

    async def cleanup(application: web.Application) -> None:
        if "agent_app" in application:
            await application["agent_app"].close_background_tasks()

    app = web.Application(middlewares=[authorize])
    app.router.add_get("/", readiness)
    app.router.add_post("/api/messages", messages)
    app.on_cleanup.append(cleanup)
    return app


def start_server(agent_factory: AgentFactory) -> None:
    web.run_app(
        create_server(agent_factory),
        host=environ.get("HOST", "localhost"),
        port=int(environ.get("PORT", "3978")),
    )
