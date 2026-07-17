# Phase 1 Build Contracts (MVP)

Binding interface contracts for the Phase 1 build. Every builder MUST follow these
exactly — other builders code against them sight-unseen. Read
`docs/superpowers/specs/2026-07-17-grand-trial-design.md` for design rationale and
`CLAUDE.md` for the teaching rules that content must embody.

## File ownership (no builder touches another's files)

- **SERVER**: `game/server/` (package `server`, entry `server/main.py`),
  `game/run.py`, `game/requirements.txt`, `game/state/progress.json` (initial).
- **ENGINE**: `game/web/index.html`, `game/web/css/style.css`,
  `game/web/js/{main,api,world,hud,region,state}.js`.
- **MINIGAME**: `game/web/js/minigames/{rune_trials,quiz_boss}.js`,
  `game/web/css/minigames.css`.
- **CONTENT**: `game/content/quests.json`, `game/content/quizbanks/pf-l1.json`,
  `01-python-fluency/**` (TRACK.md, lesson-01 with LESSON.md, quest folders),
  `02-…05-…/TRACK.md` stubs.

## Runtime

Python 3.13 venv at repo root `.venv`. Pins for `game/requirements.txt`:
`fastapi==0.139.2`, `uvicorn[standard]==0.51.0`, `pytest==9.1.1`.
`game/run.py`: starts uvicorn on **127.0.0.1:8777** serving `server.main:app`
(run.py must work when invoked from any CWD — resolve paths from `__file__`),
opens the browser to http://127.0.0.1:8777 after a short delay (`webbrowser` +
`threading.Timer`). No reload mode.

## HTTP API (server implements; client consumes via js/api.js)

- `GET /api/health` → `{"ok": true}`
- `GET /api/state` → full progress.json object
- `PUT /api/state` (JSON body = full state) → validates top-level keys
  (`player, regions, quests, curses, drills, log` all present), writes previous
  file to `game/state/progress.backup.json`, then saves. Returns saved state.
- `GET /api/content/quests` → `game/content/quests.json`
- `GET /api/content/quizbanks/{bank_id}` → `game/content/quizbanks/{bank_id}.json`.
  `bank_id` must match `^[a-z0-9-]+$` (404 otherwise — no path traversal).
- Static: mount `game/web` at `/` (html=True) AFTER the API routes.
- All file paths resolved relative to `game/` via `__file__`; UTF-8 everywhere.

## progress.json schema (initial state SERVER ships)

```json
{
  "player": {"name": "Apprentice", "xp": 0, "level": 1},
  "regions": {
    "rune-plains":      {"unlocked": true},
    "gatekeepers-forge": {"unlocked": false},
    "great-library":    {"unlocked": false},
    "war-council":      {"unlocked": false},
    "dragons-keep":     {"unlocked": false}
  },
  "quests": {},
  "curses": [],
  "drills": {"embers": 0, "last_day": null, "history": []},
  "log": []
}
```

- `quests` entries: `"<quest-id>": {"status": "in_progress"|"awaiting_review"|"passed", "updated": "<ISO date>"}`
  (absent = not started). Client may set `in_progress`/`awaiting_review` and may
  set `passed` for `type:"boss"` quests only. Code quests → GM only.
- `curses` entries: `{"question_id": "...", "bank": "...", "misses": n, "hits": n, "cleansed": false}`.
  Missed boss/drill question → add or increment. Correct answer in a drill →
  `hits += 1`; at `hits >= 2` set `cleansed: true` (keep in list).
- `drills.history` entries: `{"day": "YYYY-MM-DD", "correct": n, "total": n, "xp": n}`.
  `embers` = count of distinct days with a completed drill (never decreases).
- `log` entries: `{"ts": "<ISO>", "actor": "game"|"gm", "event": "...", "xp": <int, may be 0>}`.
- Level formula (client): `level = floor(sqrt(xp/100)) + 1`.
- XP: drill completion = 2 per correct answer; boss victory = 50; curse cleansed = 25.
  (Code quest XP is granted by the GM, not the client.)

## quests.json schema (CONTENT ships; ENGINE renders)

```json
{"quests": [
  {"id": "pf-l1-q1", "region": "rune-plains", "lesson": "L1 · Runes of Data",
   "type": "code", "title": "The Word-Hoard", "xp": 100,
   "path": "01-python-fluency/lesson-01-runes-of-data/quest-01",
   "summary": "one line", "requires": []},
  {"id": "pf-l1-boss", "region": "rune-plains", "lesson": "L1 · Runes of Data",
   "type": "boss", "title": "The Keeper of Runes", "xp": 50,
   "bank": "pf-l1", "summary": "one line", "requires": ["pf-l1-q1", "pf-l1-q2"]}
]}
```

## Quiz bank schema (CONTENT ships; MINIGAME renders)

```json
{"id": "pf-l1", "title": "Runes of Data", "boss_name": "The Keeper of Runes",
 "questions": [
   {"id": "pf-l1-001", "type": "predict"|"bug"|"truth",
    "prompt": "What does this print?", "code": "a = [1, 2]\n... or null",
    "choices": ["A", "B", "C", "D"], "answer": 0, "explain": "1-3 sentences"}
]}
```

All questions are multiple-choice via `choices` + `answer` index. `predict`:
code + printed-output choices. `bug`: code + choices describing the bug (one
correct). `truth`: statement in `prompt`, `code` null, choices True/False.

## Minigame JS interface (MINIGAME exports; ENGINE calls)

```js
window.Minigames = window.Minigames || {};
// Both games render into overlayEl (an empty fullscreen div the engine provides),
// clean up their DOM on finish, then call onComplete(result). No page reloads.
window.Minigames.runeTrials.start(overlayEl, bank, opts, onComplete);
window.Minigames.quizBoss.start(overlayEl, bank, opts, onComplete);
// opts: {questionCount: int, curseQuestions: [questionObj, ...]}  // curses first, marked visually
// result: {completed: bool, correct: int, total: int,
//          missedQuestionIds: [...], correctQuestionIds: [...], durationSec: n}
```

Rune Trials (drill): `questionCount` (default 10) random questions (curse
questions injected first, flagged "CURSE ATTACK"), per-question 45s timer, combo
meter for streaks (cosmetic), immediate feedback with `explain` after each
answer. Quiz Boss: 12 questions, boss HP = questions − (hearts − 1) — e.g. 10 —
so up to 2 wrong answers still wins (~83% mastery bar; no flawless-run
requirement, no stalemate state). Correct answers deal 1 damage; HP 0 =
immediate victory. Player has 3 hearts (wrong answer = lose one; 0 hearts =
defeat, `completed:false`). Both: fantasy
styling per `minigames.css`, code rendered monospace preserving whitespace.

ENGINE owns all state mutations from results (XP, embers, curses, quest status,
log, save via PUT). MINIGAME never touches state or the network.

## Engine UX contract

- Canvas overworld 960×540, tile-based, pixel-art drawn programmatically (no
  external assets, no CDN, no web fonts — offline-capable). WASD/arrows to walk,
  collision on water/trees. Five landmarks (region gates) placed on the map;
  standing on one + Enter (or click) opens the region panel. Locked regions:
  gray + lock icon + "Sealed — beat <requirement> first" (engine computes from
  quests: next region unlocks when all P0-marked... simplification for MVP:
  region order unlocks are GM-managed in the save; engine just renders flags).
- Region panel (DOM overlay): flavor text, three buttons — **Daily Drill**
  (any unlocked region; launches runeTrials with pf-l1 bank for now), **Quest
  Board** (lists quests for the region with status chips; quest detail view shows
  summary, XP, `path` to the brief, and submit instructions: "write your code in
  the workspace, then ask the Game Master in Claude Code for review"; a "Begin
  quest" button sets status in_progress), **Quiz Boss** (disabled until
  `requires` all passed; launches quizBoss; on victory: mark boss passed, +50 XP,
  celebratory toast; on missed questions: add curses).
- HUD bar: player name/level, XP bar with numbers, ember count 🔥, "Daily Drill"
  quick button (disabled with checkmark if `drills.history` has today; the drill
  still replayable from region panel for practice — practice runs award no XP and
  don't add embers; label them "practice").
- After every state mutation: save via PUT, optimistic UI, error toast on failure.
- First-run: if `player.name == "Apprentice"`, prompt for a hero name (in-world).
- Aesthetic: dark fantasy, parchment panels, gold XP, readable at a glance;
  system fonts only (`Georgia/serif` for flavor, monospace for code).

## Definition of done (Phase 1)

Server starts via play.bat; game loads with zero console errors; a full loop is
playable: name hero → walk to Rune Plains → daily drill (XP+ember persist across
restart) → open Quest Board → begin quest → (GM review out-of-band) → boss fight
works and grants XP/curses. Lesson 1 content complete per CLAUDE.md anatomy;
quest tests runnable via `.venv\Scripts\python.exe -m pytest <workspace>`.
