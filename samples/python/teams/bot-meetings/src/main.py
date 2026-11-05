"""Sample entry point."""

from dotenv import load_dotenv

from .start_server import start_server


def main() -> None:
    load_dotenv()
    start_server()


if __name__ == "__main__":
    main()
