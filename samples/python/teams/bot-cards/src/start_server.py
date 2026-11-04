from os import environ

from aiohttp import web
from microsoft_agents.hosting.aiohttp import (
    CloudAdapter,
    jwt_authorization_middleware,
    start_agent_process,
)
from microsoft_agents.hosting.core import AgentApplication, AgentAuthConfiguration


@web.middleware
async def readiness_and_authentication(request, handler):
    if request.method == "GET" and request.path == "/":
        return await handler(request)
    return await jwt_authorization_middleware(request, handler)


def start_server(
    agent_application: AgentApplication | None = None,
    auth_configuration: AgentAuthConfiguration | None = None,
):
    async def readiness(_request):
        return web.Response(text="Teams Cards Agent")

    async def process_message(request):
        agent = request.app["agent_app"]
        adapter = request.app["adapter"]
        if agent is None or adapter is None:
            raise web.HTTPServiceUnavailable(
                text="Configure the Azure Bot service connection before sending messages."
            )
        return await start_agent_process(request, agent, adapter)

    app = web.Application(middlewares=[readiness_and_authentication])
    app.router.add_get("/", readiness)
    app.router.add_post("/api/messages", process_message)
    app["agent_configuration"] = auth_configuration
    app["agent_app"] = agent_application
    app["adapter"] = agent_application.adapter if agent_application is not None else None
    web.run_app(app, host="localhost", port=int(environ.get("PORT", 3978)))
