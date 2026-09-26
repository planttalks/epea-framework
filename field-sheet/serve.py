#!/usr/bin/env python3
"""Serve the EPEA field sheet.

From the repository root:

    python field-sheet/serve.py

Then open http://127.0.0.1:43119
"""

from __future__ import annotations

import functools
import http.server
import os
import socketserver
from pathlib import Path

HOST = "0.0.0.0"
PORT = 43119
DIRECTORY = Path(__file__).resolve().parent


class SheetServer(socketserver.TCPServer):
    allow_reuse_address = True


def make_server(host: str = HOST, port: int = PORT) -> SheetServer:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIRECTORY))
    return SheetServer((host, port), handler)


def main() -> None:
    port = int(os.environ.get("EPEA_SHEET_PORT", PORT))
    try:
        server = make_server(HOST, port)
    except OSError as exc:
        message = (
            f"Port {port} is already in use. "
            f"Open http://127.0.0.1:{port} if the sheet is already running."
        )
        raise SystemExit(message) from exc
    url = f"http://127.0.0.1:{server.server_address[1]}"
    print("EPEA field sheet")
    print(f"Open {url}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
