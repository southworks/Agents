# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import logging

from .start_server import start_server


def main() -> None:
    logger = logging.getLogger("microsoft_agents")
    logger.addHandler(logging.StreamHandler())
    logger.setLevel(logging.INFO)
    start_server()


if __name__ == "__main__":
    main()
