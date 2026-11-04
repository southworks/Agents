import os
from pathlib import Path

from aiohttp import web
from microsoft_agents.hosting.aiohttp import (
    jwt_authorization_middleware,
    start_agent_process,
)
from microsoft_agents.hosting.core import AgentApplication


def create_web_app(agent_application: AgentApplication | None = None) -> web.Application:
    async def messages(request: web.Request) -> web.Response:
        return await start_agent_process(
            request,
            request.app["agent_app"],
            request.app["adapter"],
        )

    async def custom_form(_request: web.Request) -> web.FileResponse:
        path = Path(__file__).resolve().parents[1] / "pages" / "CustomForm" / "index.html"
        return web.FileResponse(path)

    @web.middleware
    async def readiness_and_authorization(request: web.Request, handler):
        if request.method == "GET" and request.path == "/":
            return web.Response(text="Agent is ready.")
        if request.method == "GET" and request.path == "/customform":
            return await handler(request)
        if request.app["agent_app"] is None:
            from src.agent import create_agent

            agent = create_agent()
            request.app["agent_app"] = agent
            request.app["adapter"] = agent.adapter
            request.app["agent_configuration"] = (
                agent.connection_manager.get_default_connection_configuration()
            )
        return await jwt_authorization_middleware(request, handler)

    app = web.Application(middlewares=[readiness_and_authorization])
    app.router.add_get("/", lambda _request: web.Response(text="Agent is ready."))
    app.router.add_get("/customform", custom_form)
    app.router.add_post("/api/messages", messages)
    app["agent_app"] = agent_application
    app["adapter"] = agent_application.adapter if agent_application is not None else None
    app["agent_configuration"] = (
        agent_application.connection_manager.get_default_connection_configuration()
        if agent_application is not None
        else None
    )
    return app


def start_server(agent_application: AgentApplication | None = None) -> None:
    web.run_app(
        create_web_app(agent_application),
        host="0.0.0.0",
        port=int(os.getenv("PORT", "3978")),
    )
