from os import environ

from aiohttp import web
from aiohttp.web import Application, Request, Response, run_app
from microsoft_agents.hosting.aiohttp import (
    jwt_authorization_middleware,
    start_agent_process,
)

from .agent import create_agent


async def _entry_point(request: Request) -> Response:
    agent = request.app["agent_app"]
    return await start_agent_process(request, agent, agent.adapter)


@web.middleware
async def _authenticated_routes(request: Request, handler):
    if request.method == "GET" and request.path == "/":
        return web.Response(text="Wikipedia Search Agent")

    if request.app["agent_app"] is None:
        agent = create_agent()
        request.app["agent_app"] = agent
        request.app["agent_configuration"] = (
            agent.connection_manager.get_default_connection_configuration()
        )

    return await jwt_authorization_middleware(request, handler)


def start_server() -> None:
    app = Application(middlewares=[_authenticated_routes])
    app.router.add_post("/api/messages", _entry_point)
    app["agent_app"] = None
    app["agent_configuration"] = None
    run_app(app, host="localhost", port=int(environ.get("PORT", "3978")))
