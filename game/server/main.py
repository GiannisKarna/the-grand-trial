"""The Grand Trial — FastAPI backend.

Serves the save-state API, the content API, and the static browser client.
All file paths are resolved relative to ``game/`` via ``__file__`` so the
server works no matter which directory it is launched from. Every file
read/write is explicit UTF-8.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import gemini

# --- Paths (all relative to game/, resolved from this file) -----------------

GAME_DIR = Path(__file__).resolve().parent.parent
STATE_DIR = GAME_DIR / "state"
STATE_FILE = STATE_DIR / "progress.json"
BACKUP_FILE = STATE_DIR / "progress.backup.json"
CONTENT_DIR = GAME_DIR / "content"
QUESTS_FILE = CONTENT_DIR / "quests.json"
QUIZBANKS_DIR = CONTENT_DIR / "quizbanks"
MINIGAMES_DIR = CONTENT_DIR / "minigames"
WEB_DIR = GAME_DIR / "web"

# "trials" (added in Phase 2) is deliberately NOT required: older saves lack
# it, so PUT accepts it without demanding it and GET merges in a default.
REQUIRED_STATE_KEYS = ("player", "regions", "quests", "curses", "drills", "log")
BANK_ID_RE = re.compile(r"^[a-z0-9-]+$")

# Serializes ALL access to progress.json. Without this, two overlapping PUTs
# (the client saves optimistically, without awaiting) interleave writes into
# the same temp file and corrupt the save; on Windows a concurrent reader also
# makes os.replace fail with a sharing violation (WinError 32).
_STATE_LOCK = threading.Lock()

# Windows registries sometimes map .js/.css to the wrong MIME type, which
# breaks module scripts in the browser. Pin the correct types explicitly.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

app = FastAPI(title="The Grand Trial")


# --- Helpers -----------------------------------------------------------------


def _load_json(path: Path, description: str) -> Any:
    """Read a JSON file as UTF-8, mapping missing files to a clean 404."""
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"{description} not found")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500, detail=f"{description} is not valid JSON: {exc}"
        ) from exc


# --- API routes (must be registered BEFORE the static mount) -----------------


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/state")
def get_state() -> Any:
    with _STATE_LOCK:
        state = _load_json(STATE_FILE, "progress.json")
    # Older saves predate the "trials" key; merge the default so clients can
    # rely on it being present.
    if isinstance(state, dict) and "trials" not in state:
        state["trials"] = {}
    return state


def _replace_with_retry(src: Path, dst: Path, attempts: int = 6) -> None:
    """os.replace, retrying briefly on Windows sharing violations.

    External readers (antivirus, indexers, editors) can hold the destination
    open without FILE_SHARE_DELETE, which makes an otherwise-atomic replace
    raise PermissionError. A few short retries ride that out.
    """
    for attempt in range(attempts):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.05)


@app.put("/api/state")
def put_state(state: dict[str, Any]) -> dict[str, Any]:
    missing = [key for key in REQUIRED_STATE_KEYS if key not in state]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"state is missing required top-level keys: {', '.join(missing)}",
        )
    with _STATE_LOCK:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        if STATE_FILE.is_file():
            shutil.copyfile(STATE_FILE, BACKUP_FILE)
        tmp_file = STATE_FILE.with_name(STATE_FILE.name + ".tmp")
        tmp_file.write_text(
            json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        _replace_with_retry(tmp_file, STATE_FILE)
    return state


@app.get("/api/content/quests")
def get_quests() -> Any:
    return _load_json(QUESTS_FILE, "quests.json")


@app.get("/api/content/quizbanks")
def list_quizbanks() -> dict[str, list[str]]:
    if not QUIZBANKS_DIR.is_dir():
        return {"banks": []}
    banks = sorted(
        path.stem
        for path in QUIZBANKS_DIR.glob("*.json")
        if BANK_ID_RE.fullmatch(path.stem)
    )
    return {"banks": banks}


@app.get("/api/content/quizbanks/{bank_id}")
def get_quizbank(bank_id: str) -> Any:
    if not BANK_ID_RE.fullmatch(bank_id):
        raise HTTPException(status_code=404, detail="quiz bank not found")
    return _load_json(QUIZBANKS_DIR / f"{bank_id}.json", f"quiz bank '{bank_id}'")


@app.get("/api/content/minigames/{minigame_id}")
def get_minigame_config(minigame_id: str) -> Any:
    if not BANK_ID_RE.fullmatch(minigame_id):
        raise HTTPException(status_code=404, detail="minigame config not found")
    return _load_json(
        MINIGAMES_DIR / f"{minigame_id}.json", f"minigame config '{minigame_id}'"
    )


@app.post("/api/explain")
def explain(payload: dict[str, Any]) -> dict[str, Any]:
    """Proxy the 'Ask the Teacher' deep explanation to Gemini.

    The API key lives server-side (secrets.local.json / GEMINI_API_KEY) and is
    never sent to the browser. Always returns HTTP 200 with an ``{"ok": ...}``
    body so the client can render either the explanation or a friendly,
    in-world error for any failure (no key, rate limit, network, empty reply).
    """
    return gemini.explain_question(payload)


# --- Static client (registered AFTER the API routes) -------------------------

# Ensure the directory exists even before the web client is built, so static
# requests return a clean 404 instead of a 500.
WEB_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
