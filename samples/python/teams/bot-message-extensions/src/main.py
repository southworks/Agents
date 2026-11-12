from dotenv import load_dotenv

from src.start_server import run_server


def main() -> None:
    load_dotenv()
    run_server()


if __name__ == "__main__":
    main()
