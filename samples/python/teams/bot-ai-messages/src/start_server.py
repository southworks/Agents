# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from os import environ

from aiohttp import web
from aiohttp.web import Application, Request, Response
from microsoft_agents.hosting.aiohttp import (
    CloudAdapter,
    jwt_authorization_middleware,
    start_agent_process,
)
from microsoft_agents.hosting.core import AgentApplication


def start_server() -> None:
    async def entry_point(request: Request) -> Response:
        agent: AgentApplication = request.app["agent_app"]
        adapter: CloudAdapter = request.app["adapter"]
        return await start_agent_process(request, agent, adapter)

    @web.middleware
    async def authorize_messages(request: Request, handler):
        if request.method == "GET" and request.path == "/":
            return web.Response(text="Agent is ready.")

        if request.method == "POST" and request.path == "/api/messages":
            agent = request.app.get("agent_app")
            if agent is None:
                from .agent import create_agent

                agent = create_agent()
                request.app["agent_app"] = agent
                request.app["adapter"] = agent.adapter
                request.app["agent_configuration"] = (
                    agent.connection_manager.get_default_connection_configuration()
                )

        return await jwt_authorization_middleware(request, handler)

    app = Application(middlewares=[authorize_messages])
    app.router.add_get("/", lambda _request: web.Response(text="Agent is ready."))
    app.router.add_post("/api/messages", entry_point)

    web.run_app(app, host="localhost", port=int(environ.get("PORT", "3978")))
