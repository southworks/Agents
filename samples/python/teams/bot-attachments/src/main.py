"""Runnable entry point for the Agent Attachments sample."""

import logging

from .agent import create_agent
from .start_server import start_server

logging.basicConfig(level=logging.INFO)


def main() -> None:
    start_server(create_agent)


if __name__ == "__main__":
    main()
