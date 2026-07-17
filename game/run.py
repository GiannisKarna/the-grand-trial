"""The Grand Trial — launcher.

Starts uvicorn on 127.0.0.1:8777 serving ``server.main:app`` and opens the
browser shortly after. Works from any CWD: all paths resolve from ``__file__``.
"""

from __future__ import annotations

import sys
import threading
import webbrowser
from pathlib import Path

GAME_DIR = Path(__file__).resolve().parent

# Make the `server` package importable regardless of the caller's CWD.
sys.path.insert(0, str(GAME_DIR))

import uvicorn  # noqa: E402  (needs sys.path set first for app import string)

HOST = "127.0.0.1"
PORT = 8777
URL = f"http://{HOST}:{PORT}"


def _open_browser() -> None:
    webbrowser.open(URL)


def main() -> None:
    threading.Timer(1.5, _open_browser).start()
    uvicorn.run("server.main:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
