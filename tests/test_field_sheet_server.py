"""The field sheet server must answer on its own address."""

from __future__ import annotations

import importlib.util
import threading
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load_server():
    path = ROOT / "field-sheet" / "serve.py"
    spec = importlib.util.spec_from_file_location("epea_sheet_server", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_field_sheet_server_serves_index() -> None:
    server_module = _load_server()
    httpd = server_module.make_server("127.0.0.1", 0)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        port = httpd.server_address[1]
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=5) as response:
            body = response.read().decode("utf-8")
            assert response.status == 200
        assert "EPEA field sheet" in body
        assert "Eco-pharmaco-economic analysis" in body
        assert "http://127.0.0.1:43119" in body
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)
