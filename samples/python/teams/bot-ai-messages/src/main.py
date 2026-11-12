"""Start the AI Messages agent web server."""

import logging

from src.agent import create_agent
from src.start_server import start_server


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    start_server(create_agent)


if __name__ == "__main__":
    main()
