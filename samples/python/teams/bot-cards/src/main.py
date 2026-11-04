from os import environ

from dotenv import load_dotenv

from .agent import create_agent
from .start_server import start_server


def main():
    load_dotenv()
    if all(
        environ.get(key)
        for key in (
            "CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTID",
            "CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTSECRET",
            "CONNECTIONS__SERVICE_CONNECTION__SETTINGS__TENANTID",
        )
    ):
        app = create_agent()
        start_server(
            agent_application=app,
            auth_configuration=app.connection_manager.get_default_connection_configuration(),
        )
    else:
        start_server()


if __name__ == "__main__":
    main()
