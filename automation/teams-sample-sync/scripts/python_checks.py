"""Trusted candidate compilation/import and protected unittest execution."""

import importlib
import importlib.util
from pathlib import Path
import sys
import unittest
import os
import socket
import subprocess
import time
from urllib.request import urlopen


PROCESS_SPEC = importlib.util.spec_from_file_location("python_process", Path(__file__).with_name("python_process.py"))
PROCESS = importlib.util.module_from_spec(PROCESS_SPEC)
PROCESS_SPEC.loader.exec_module(PROCESS)


def require_fresh_source(root):
    pending = [root]
    while pending:
        directory = pending.pop()
        for file in directory.iterdir():
            if file.is_symlink():
                raise ValueError("Python candidate must not contain symlinks")
            if file.name in {".venv", "venv", ".git"}:
                continue
            if file.name == "__pycache__" or file.suffix in {".pyc", ".pyo"}:
                raise ValueError("Python candidate contains untrusted bytecode cache")
            if file.is_dir():
                pending.append(file)


def compile_sources(root):
    require_fresh_source(root)
    files = sorted((root / "src").rglob("*.py"))
    if not files:
        raise ValueError("Python candidate contains no application source")
    for file in files:
        if file.is_symlink():
            raise ValueError("Python source must not be a symlink")
        # Compile fresh source in memory; never trust or generate cached bytecode.
        compile(file.read_bytes(), str(file), "exec")


def import_application(root):
    require_fresh_source(root)
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root))
    module = importlib.import_module("src.agent")
    factory = getattr(module, "create_agent", None)
    if not callable(factory):
        raise ValueError("Python candidate must export src.agent.create_agent")


def run_contracts(root, contract):
    require_fresh_source(root)
    if not contract.is_file() or contract.is_symlink():
        raise ValueError("Required protected Python contract suite is missing")
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root))
    sys.path.insert(0, str(contract.parent))
    spec = importlib.util.spec_from_file_location("protected_sample_contract", contract)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    suite = unittest.defaultTestLoader.loadTestsFromModule(module)
    if suite.countTestCases() == 0:
        raise ValueError("Protected Python contract suite collected zero tests")
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful() or result.skipped or result.expectedFailures:
        raise ValueError("Every protected Python contract must execute and pass")


def http_smoke(root):
    require_fresh_source(root)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    environment = {**os.environ, "PORT": str(port)}
    child = PROCESS.start_process(
        [sys.executable, "-I", "-B", str(Path(__file__).resolve()), "serve", str(root)],
        cwd=root, env=environment, stdin=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise ValueError("Python HTTP process exited before readiness")
            try:
                with urlopen(f"http://127.0.0.1:{port}/", timeout=0.5) as response:
                    if response.status == 200:
                        return
            except OSError:
                pass
            time.sleep(0.25)
        raise ValueError("Python HTTP GET / did not return 200")
    finally:
        PROCESS.stop_process(child)


if __name__ == "__main__":
    try:
        if len(sys.argv) < 3:
            raise ValueError("Usage: python_checks.py compile|import|contracts SAMPLE [CONTRACT]")
        mode, sample = sys.argv[1:3]
        root = Path(sample).resolve()
        network_spec = importlib.util.spec_from_file_location("python_network", Path(__file__).with_name("python_network.py"))
        network = importlib.util.module_from_spec(network_spec)
        network_spec.loader.exec_module(network)
        network.restrict_network(terminate=mode == "serve")
        if mode == "compile":
            compile_sources(root)
        elif mode == "import":
            import_application(root)
        elif mode == "smoke":
            http_smoke(root)
        elif mode == "serve":
            import runpy
            sys.path.insert(0, str(root))
            runpy.run_module("src.main", run_name="__main__")
        elif mode == "contracts" and len(sys.argv) == 4:
            # Make the selected root available without candidate pytest configuration.
            sys.argv = [sys.argv[0], str(root), sys.argv[3]]
            run_contracts(root, Path(sys.argv[2]).resolve())
        else:
            raise ValueError("Unsupported Python check operation")
        network.assert_no_external_requests()
    except (OSError, ValueError, SyntaxError, ImportError) as error:
        print(f"Python validation failed: {error}", file=sys.stderr)
        sys.exit(1)
