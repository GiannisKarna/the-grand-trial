# The Grand Trial — Design Spec

**Date:** 2026-07-17
**Status:** Approved (brainstormed and confirmed with the student)

## What this is

A gamified private technical classroom that trains the student for AI engineer /
software engineer interviews. The repository contains a real, playable 2D fantasy-RPG
browser game that wraps a serious curriculum. Minigames teach concepts; **real code
quests** — written by the student from a blank file in real repo folders — gate all
progression. Claude acts as teacher and **Game Master**.

## Student profile

- AI Solutions Engineer; strong theoretical understanding of AI concepts.
- Self-described "vibe coder": has agents write code; the gap is *producing code
  personally, from a blank page, under pressure*.
- Interviews expected within **1–2 months** across four formats: live Python coding,
  AI system design, take-home project, AI/LLM conceptual deep-dive.
- Irregular/bursty schedule → lessons must be self-contained; state must survive gaps.
- Gets bored easily → engagement is a first-class requirement, hence the game.

## Non-negotiable teaching contract

1. **The student writes the code.** Claude demos only minimal teaching examples.
   Exercises start from a blank file. Hints escalate (nudge → pointer → pseudocode);
   Claude never types the student's solution.
2. **Full-picture honesty (no-bias rule).** Every technology is taught with a
   **Decision Card**: problem it solves, how it works under the hood, system impact,
   hardware impact (CPU/memory/network/disk), failure modes, when NOT to use it,
   alternatives, and costs on every axis (latency, money, complexity, ops burden,
   development cost — one axis among equals, never the silent tiebreaker).
3. **Session protocol.** Start: read PROGRESS.md + game state, quiz 2–3 weak-spot
   items (spaced repetition). End: update PROGRESS.md and game state.
4. **Quiz gate.** A lesson is done when the quiz boss is beaten, not when code runs.
   Failed questions become **Curses** that re-attack in later sessions until cleansed.
5. **Interview framing.** Every lesson ends with how the topic appears in interviews.

## The game world

Fantasy RPG: the student is an apprentice engineer-mage preparing to face
**the Dragon** (the interview). Five regions map to five tracks:

| Region | Track folder | Teaches |
|---|---|---|
| The Rune Plains | `01-python-fluency` | Python syntax/data structures; recurring daily drills |
| The Gatekeeper's Forge | `02-backend-engineering` | FastAPI, testing, SQL, caching |
| The Great Library | `03-ai-engineering` | RAG, embeddings, LangChain/LangGraph, evals |
| The War Council | `04-system-design` | Trade-off training via Decision Card battles |
| The Dragon's Keep | `05-take-home-sim` | Timed capstones, mock-interview boss fights |

**Decision Cards are literal collectible game cards** with stats on every axis.
War Council minigames are card battles against scenario constraints with simulated
consequence meters (latency/cost/complexity).

## Core loop

1. Launch game (one command → FastAPI serves browser client).
2. Daily drill: ~10 min Rune Trials before anything else.
3. Concept minigame in the current region.
4. **Real-code quest**: game points to a repo folder (`brief.md` + workspace);
   student writes real code; Claude reviews; on pass **Claude** updates the save
   file — XP awarded, zones/lessons unlock. Claude is the only one who marks
   quests passed (honor system acknowledged: the save file is editable, but the
   Dragon is real).
5. Quiz boss gates lesson completion; failures become Curses.

## Architecture

- `game/server/` — FastAPI app: serves static client, GET/POST state API, content API.
- `game/web/` — vanilla HTML5 canvas + JS client. Tile-based overworld, walkable
  character, region screens, minigame modals, HUD (XP/level/streak).
- `game/state/progress.json` — single source of truth for XP, quests, curses, drills.
  Committed to git (save history = learning journal).
- `game/content/` — JSON quiz banks and quest catalog. Content is data, not code:
  adding lessons never requires touching the engine.
- Track folders hold `TRACK.md`, lesson folders (`LESSON.md`, quest folders with
  `brief.md` + `workspace/` + tests).
- Core files: `CLAUDE.md` (teaching contract + Game Master protocol — auto-loaded
  every session), `CURRICULUM.md` (quest catalog, P0/P1/P2), `PROGRESS.md`
  (session log, weak spots, next-up pointer).

## Phasing

- **Phase 1 (MVP, this build):** world map + movement, save/XP/level system, quest
  log, Rune Trials minigame (output-prediction, spot-the-bug, speed rounds), quiz
  boss mode, core MD files, **Lesson 1 complete** (Runes of Data — Python core data
  structures), first real-code quest wired end-to-end. Game playable immediately.
- **Phase 2:** Great Library minigames (chunking/retrieval), War Council card
  battles, Summoning Circles, Curse system fully animated.
- **Phase 3:** Boss-fight gauntlets (timed mixed quiz+code), Forge minigames
  (event-loop tavern), the Dragon, polish.

## Decisions made and deferred

- Docker: **deferred by student request.** Repo stays docker-ready (pinned deps, no
  hard-coded paths) but no Dockerfile now. Distribution = GitHub repo (the repo IS
  the product: game + curriculum + CLAUDE.md Game Master protocol).
- Hosting/multi-user: rejected — breaks the Claude-as-Game-Master loop.
- Python 3.13 local venv (`.venv`), dependencies pinned in `game/requirements.txt`.
