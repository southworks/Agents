"""Explicit entry point for running the meeting agent."""

from dotenv import load_dotenv

from .agent import create_agent
from .start_server import start_server


def main() -> None:
    load_dotenv()
    start_server(create_agent)


if __name__ == "__main__":
    main()
