import logging

from .agent import AGENT_APP, connection_manager
from .start_server import start_server

logging.basicConfig(level=logging.INFO)
start_server(
    agent_application=AGENT_APP,
    auth_configuration=connection_manager.get_default_connection_configuration(),
)
