"""The Grand Trial — Gemini proxy for the "Ask the Teacher" deep-explanation.

The browser never sees the API key: the client POSTs the question context to our
own FastAPI server, and THIS module makes the outbound call to Gemini with the
key that lives server-side in ``game/secrets.local.json`` (gitignored) or the
``GEMINI_API_KEY`` env var. That "put the secret behind your own backend" shape
is the single most important habit in LLM engineering.

Deliberately written with the standard library only (``urllib``) — no SDK — so
it doubles as a worked reference for Great Library L1 · Speaking to Spirits:
a raw LLM HTTP call, a hand-built prompt, config/secret handling, and defensive
error mapping. Read it when you reach that region.
"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

GAME_DIR = Path(__file__).resolve().parent.parent
SECRETS_FILE = GAME_DIR / "secrets.local.json"

# HTTPS to Gemini needs a CA bundle. Many Python builds (pyenv / uv / venv on
# macOS) ship no usable trust store, so ssl's default context fails with
# CERTIFICATE_VERIFY_FAILED even though the machine is online. certifi supplies
# a portable bundle; fall back to the platform default if it is absent.
try:
    import certifi

    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except Exception:  # noqa: BLE001 — never let cert setup break import
    _SSL_CONTEXT = ssl.create_default_context()

DEFAULT_MODEL = "gemini-flash-latest"
ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
TIMEOUT_SECONDS = 45
MAX_FIELD_CHARS = 4000  # defensive cap on any single incoming field


# --- Config / secrets --------------------------------------------------------


def _load_secrets() -> dict[str, Any]:
    """Read secrets.local.json if present; never raise on a bad/missing file."""
    if SECRETS_FILE.is_file():
        try:
            data = json.loads(SECRETS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def get_config() -> tuple[str | None, str]:
    """Return (api_key, model). Env vars win over the file; missing key -> None."""
    secrets = _load_secrets()
    key = os.environ.get("GEMINI_API_KEY") or secrets.get("gemini_api_key")
    model = (
        os.environ.get("GEMINI_MODEL") or secrets.get("gemini_model") or DEFAULT_MODEL
    )
    # The committed template ships a placeholder; treat it as "no key set".
    if isinstance(key, str) and key.strip().startswith("PASTE_"):
        key = None
    return (key or None), model


# --- Prompt construction -----------------------------------------------------

SYSTEM_PROMPT = """\
You are "Ο Δάσκαλος" (The Teacher), a warm, patient mentor inside a fantasy-RPG \
game that is training Dimitris to become an AI / software engineer.

WHO THE STUDENT IS
- Dimitris is a frontend engineer with ~4 years of JavaScript (vanilla JS, \
React/Next.js, some Node/Express). He is smart and understands programming.
- He has shipped almost NO Python and NO ML/AI code. Treat him as a capable \
beginner in Python: the logic is familiar, but Python syntax, idioms and the \
"why under the hood" are new.
- His superpower is JavaScript. ALWAYS bridge the concept from its JavaScript \
equivalent at least once ("στη JavaScript θα έγραφες ..., στην Python ...").

HOW TO TEACH (teacher-to-student)
- Beginner-friendly and concrete. First explain the underlying mechanism in \
plain words, THEN exactly why the correct answer is correct and why the most \
tempting wrong answer is wrong.
- Use one small, vivid analogy. Be encouraging; never condescend.
- Stay on THIS ONE question. No tangents, no restating the whole curriculum.

OUTPUT FORMAT — follow exactly
1. Write the MAIN explanation in GREEK (Ελληνικά), simple and clear, including \
at least one explicit JavaScript-to-Python bridge. Keep all code, keywords and \
technical terms in English (e.g. list, hash table, O(1), reference).
2. Then one short final section, its heading EXACTLY this line:
🎤 How you'd say this in an interview
   Under it, 2-4 sentences in ENGLISH giving the crisp, professional phrasing an \
interviewer wants to hear.

STYLE
- ~200-350 words total. Short paragraphs.
- You MAY use ```python fenced code blocks for code. Do NOT use markdown \
headings (#) or tables. Light **bold** for key terms is fine.
"""


def _clip(value: Any) -> str:
    text = "" if value is None else str(value)
    return text[:MAX_FIELD_CHARS]


def build_user_message(payload: dict[str, Any]) -> str:
    """Turn the client's question context into the user turn for Gemini."""
    prompt = _clip(payload.get("prompt"))
    code = _clip(payload.get("code"))
    qtype = _clip(payload.get("type")) or "question"
    lesson = _clip(payload.get("lessonTitle")) or "a Python lesson"
    boss = _clip(payload.get("bossName"))
    correct = _clip(payload.get("correctAnswer"))
    chosen = payload.get("chosenAnswer")
    was_correct = bool(payload.get("wasCorrect"))
    hint = _clip(payload.get("explain"))

    choices = payload.get("choices")
    choice_lines = []
    if isinstance(choices, list):
        for i, choice in enumerate(choices[:12], start=1):
            choice_lines.append(f"  {i}) {_clip(choice)}")

    lines = [
        f"LESSON: {lesson}" + (f" (guardian: {boss})" if boss else ""),
        f"QUESTION TYPE: {qtype}",
        f"QUESTION: {prompt}",
    ]
    if code:
        lines.append("CODE:\n" + code)
    if choice_lines:
        lines.append("CHOICES:\n" + "\n".join(choice_lines))
    lines.append(f"CORRECT ANSWER: {correct}")
    if chosen is None:
        lines.append("STUDENT'S ANSWER: (not recorded)")
    else:
        verdict = "correct" if was_correct else "WRONG"
        lines.append(f"STUDENT'S ANSWER: {_clip(chosen)}  -> {verdict}")
    if hint:
        lines.append(f"SHORT HINT ALREADY SHOWN: {hint}")
    lines.append(
        "\nTeach him this one question now, in the format above. "
        "If he answered wrong, gently show where the misconception is."
    )
    return "\n".join(lines)


# --- The outbound call -------------------------------------------------------


def _extract_text(data: dict[str, Any]) -> str:
    """Pull the answer text out of a Gemini generateContent response."""
    candidates = data.get("candidates") or []
    if not candidates:
        return ""
    parts = (candidates[0].get("content") or {}).get("parts") or []
    return "".join(part.get("text", "") for part in parts).strip()


def _call_gemini(api_key: str, model: str, user_message: str) -> str:
    body = json.dumps(
        {
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": user_message}]}],
            # gemini-flash-latest is a "thinking" model: hidden reasoning tokens
            # are drawn from this same budget, so a tight cap truncates the
            # visible answer (the interview section vanished at 2048). Give it
            # ample room — the reply itself stays ~300 words by the prompt.
            "generationConfig": {"temperature": 0.6, "maxOutputTokens": 8192},
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        ENDPOINT.format(model=model),
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(
        request, timeout=TIMEOUT_SECONDS, context=_SSL_CONTEXT
    ) as response:
        data = json.loads(response.read().decode("utf-8"))
    return _extract_text(data)


# --- Public entry point (called by the FastAPI route) ------------------------


def explain_question(payload: dict[str, Any]) -> dict[str, Any]:
    """Return {"ok": True, "explanation", "model"} or {"ok": False, "error"}.

    Always resolves to a dict (never raises to the route) so the client can
    render a friendly, in-world message for every failure mode.
    """
    if not isinstance(payload, dict):
        return {"ok": False, "error": "Η ερώτηση έφτασε παραμορφωμένη στον Δάσκαλο."}

    api_key, model = get_config()
    if not api_key:
        return {
            "ok": False,
            "error": (
                "Δεν βρέθηκε Gemini API key. Βάλε το key σου στο "
                "game/secrets.local.json (πεδίο \"gemini_api_key\") ή στη "
                "μεταβλητή περιβάλλοντος GEMINI_API_KEY, και ξεκίνα ξανά τον server."
            ),
        }

    user_message = build_user_message(payload)

    try:
        text = _call_gemini(api_key, model, user_message)
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            err = json.loads(exc.read().decode("utf-8"))
            detail = (err.get("error") or {}).get("message", "")
        except Exception:  # noqa: BLE001 — best-effort detail extraction
            pass
        if exc.code == 429:
            msg = (
                "Ο Δάσκαλος ξεψύχησε προσωρινά — ξεπεράστηκε το quota του Gemini "
                "(rate limit). Δοκίμασε σε λίγο ή άλλαξε μοντέλο στο secrets.local.json."
            )
        elif exc.code in (401, 403):
            msg = (
                "Το Gemini απέρριψε το key (HTTP %d). Έλεγξε ότι το gemini_api_key "
                "είναι σωστό και ενεργό." % exc.code
            )
        elif exc.code == 404:
            msg = (
                "Το μοντέλο '%s' δεν είναι διαθέσιμο (HTTP 404). Δοκίμασε "
                "'gemini-flash-latest' στο secrets.local.json." % model
            )
        else:
            msg = "Το Gemini επέστρεψε σφάλμα HTTP %d." % exc.code
        if detail:
            msg += " — " + detail
        return {"ok": False, "error": msg}
    except urllib.error.URLError as exc:
        return {
            "ok": False,
            "error": (
                "Δεν έγινε σύνδεση με το Gemini (δίκτυο). Έλεγξε τη σύνδεσή σου. "
                f"[{exc.reason}]"
            ),
        }
    except Exception as exc:  # noqa: BLE001 — never leak a 500 to the client
        return {"ok": False, "error": f"Απρόσμενο σφάλμα στον Δάσκαλο: {exc}"}

    if not text:
        return {
            "ok": False,
            "error": (
                "Ο Δάσκαλος έμεινε άφωνος (κενή απάντηση από το μοντέλο). "
                "Δοκίμασε ξανά."
            ),
        }

    return {"ok": True, "explanation": text, "model": model}
