# Phase 2+3 Build Contracts — Finishing the Game

Binding contracts for completing The Grand Trial. Read first:
`docs/superpowers/specs/2026-07-17-grand-trial-design.md`, `CLAUDE.md`,
`docs/superpowers/plans/2026-07-17-phase1-contracts.md` (Phase 1 contracts stay
in force: state schema, API, minigame calling convention, quiz bank schema).

## What "finished" means

Every region has a playable concept minigame ("Region Trial") + the existing
drill/quest-board/quiz-boss loop; the Dragon's Keep hosts the final gauntlet;
curses are visible and manageable (Curse Codex); lightweight SFX + polish.
Content is data-driven: every minigame reads a JSON config; adding future
lessons never touches engine code.

## File ownership

- **SERVER-EXT**: `game/server/main.py` (extend), `game/state/progress.json` (add key).
- **ENGINE-EXT**: `game/web/index.html`, `game/web/css/style.css`,
  `game/web/js/{state,hud,region,world,main}.js` (extend), NEW `game/web/js/sfx.js`.
- **LIBRARY**: `game/web/js/minigames/library_trial.js`,
  `game/content/minigames/library-trial.json`.
- **CIRCLES**: `game/web/js/minigames/summoning_circles.js`,
  `game/content/minigames/summoning-circles.json`.
- **WARCOUNCIL**: `game/web/js/minigames/war_council.js`,
  `game/content/minigames/war-council.json`.
- **FORGE**: `game/web/js/minigames/forge_tavern.js`,
  `game/content/minigames/forge-tavern.json`.
- **DRAGON**: `game/web/js/minigames/dragon_gauntlet.js`,
  `game/content/minigames/dragon-gauntlet.json`.
- Shared minigame CSS: each new minigame appends ONLY new, uniquely-prefixed
  classes to its own `<own-name>.css` file in `game/web/css/minigames/`
  (e.g. `library_trial.css`); ENGINE-EXT links them all in index.html.

## Server extensions (SERVER-EXT)

- `GET /api/content/quizbanks` → `{"banks": ["pf-l1", ...]}` (list of `.json`
  stems in `content/quizbanks/`, sorted).
- `GET /api/content/minigames/{id}` → `content/minigames/{id}.json`, same
  `^[a-z0-9-]+$` guard as quizbanks.
- `game/state/progress.json`: add `"trials": {}` top-level key. PUT validation:
  `trials` is accepted but NOT required (back-compat with older saves); GET
  merges `{"trials": {}}` into loaded state if absent before returning.

## State additions (ENGINE-EXT owns the logic)

- `trials.<region-id>` = `{"last_day": "YYYY-MM-DD"|null, "best": int,
  "history": [{"day","score","max","xp"}]}`.
- Region Trial XP: `round(10 * score/max)` (max 10), awarded only on the first
  completed run per region per day; later same-day runs are labeled practice
  (0 XP). `best` tracks the all-time best percentage (0-100).
- Dragon victory: set `quests["the-dragon"].status = "passed"` (engine may do
  this — the Dragon auto-grades like a boss), award its `xp` from quests.json
  once; repeat victories are practice.
- Log every award with actor `"game"`.

## Minigame calling convention (unchanged) + config

`window.Minigames.<camelName>.start(overlayEl, config, opts, onComplete)`
- `config` = the minigame's parsed JSON from `/api/content/minigames/<id>`.
  For dragonGauntlet, ENGINE additionally passes `opts.banks` = array of ALL
  loaded quiz-bank objects (fetched via the bank listing).
- `opts` = `{practice: bool}` (+ dragon extras above). Every game must show a
  small "Practice run — no XP" ribbon when `opts.practice` is true.
- `result` = `{completed: bool, score: int, max: int, durationSec: int}`
  (+ `missedQuestionIds`/`correctQuestionIds` ONLY from quiz-backed games:
  dragonGauntlet emits them; the four concept games emit `[]`).
- Games never touch state/network/engine internals; clean up DOM + listeners;
  call onComplete exactly once. Keyboard: number keys select options, Esc is
  reserved by the engine (abort = onComplete({completed:false,...})). All
  animation CSS-based; no external assets; escape all dynamic text.

## Region → activities map (ENGINE-EXT)

Region panel gains a **Region Trial** button (icon + name below) between Daily
Drill and Quest Board. Sealed regions stay sealed (GM unlocks via save file).

| region | trial minigame | trial title in UI |
|---|---|---|
| rune-plains | (none — its trial IS the daily drill; hide the button) | — |
| gatekeepers-forge | forgeTavern | The Tavern of One Bartender |
| great-library | libraryTrial | The Sundered Scrolls |
| war-council | warCouncil | The Council of Trade-offs |
| dragons-keep | dragonGauntlet | THE DRAGON (styled as the region's boss;
  the dragons-keep panel shows no Quiz Boss button — the Dragon replaces it) |

Daily-drill bank per region (fallback `pf-l1` until later lessons ship banks):
engine keeps a `REGION_DRILL_BANK` map with all five pointing at `pf-l1` for
now, reading from the bank listing to prefer `<prefix>-l1` when present later
(`gf-`, `gl-`, `wc-`, `dk-`).

## The four concept minigames — design contracts

Shared shape: splash (title, flavor, Begin) → 3 rounds → end screen
(score/max, per-round recap, best-tier flavor line). `score`/`max` are round
points summed. Each round ends with a short "What this teaches" card — one
paragraph connecting the mechanic to the production concept (the teaching
moment; require a click to continue, never auto-advance).

**libraryTrial — "The Sundered Scrolls" (RAG):**
R1 Relevance: query + 6 chunk cards → pick the 2 truly relevant (config marks
them); score = picks correct. R2 Chunking: a scroll type (e.g. legal contract,
chat log, API docs) + 3 chunking strategies with tradeoff text → pick the one
the config marks best; show simulated recall/precision bars for each after
answering. R3 Pipeline: 6 stage tiles (chunk, embed, index, retrieve, rerank,
generate) shuffled → click in correct order; wrong click shakes and costs a
point. Config: `{"rounds": {"relevance": [...], "chunking": [...],
"pipeline": {...}}}` with 3+ variants per round (game picks randomly).

**summoningCircles — "The Summoning Circles" (agents/orchestration):**
R1 Choose the Familiar: task descriptions → pick correct agent/tool card
(calculator, retriever, web-searcher, code-runner, plain LLM). R2 Order the
Ritual: agent-loop steps (receive → plan → tool call → observe → decide →
respond) shuffled; click in order. R3 Trace the Corruption: a rendered
execution trace (5-7 steps) with exactly one wrong step (config marks it +
why); click the corrupted step. Config mirrors this structure, 3+ variants
per round.

**warCouncil — "The Council of Trade-offs" (system design; Decision Cards):**
The student is handed a scenario (constraints: p95 latency budget ms, monthly
gold budget, requests/sec, quality floor) and a hand of 8 Decision Cards drawn
from the config deck (12+ cards: response-cache, prompt-cache, queue,
vector-db, reranker, smaller-model, bigger-model, batch-endpoint, streaming,
fallback-model, rate-limiter, fine-tune). Each card shows honest stats:
latency delta, gold cost, complexity points, quality delta, and a
when-it-backfires line. Player plays exactly 3 cards; the sim applies deltas
(plus per-scenario synergy/conflict overrides in config, e.g. response-cache
is weak when `cache_hit_rate` is low) and animates four meters vs the
constraints. Win = all constraints met (score = constraints met, max 4).
3 scenarios per session from 5+ in config. Config:
`{"deck": [...], "scenarios": [{constraints, hand, overrides, debrief}]}`.
Every scenario ends with a debrief card naming the intended optimal plays AND
why plausible alternatives fail — full no-bias honesty, this is the Decision
Card mechanic made playable.

**forgeTavern — "The Tavern of One Bartender" (async/event loop):**
The bartender = the event loop. Orders arrive (config: name, kind
`io`/`cpu`, duration ticks); for each, player chooses AWAIT (park it — right
for io), DO NOW (blocks the loop — right for quick cpu), or SEND TO KITCHEN
(worker thread — right for long cpu). A timeline animates tick-by-tick showing
the loop blocked/free and patrons' patience bars; score = orders served before
patience runs out vs total. 3 rounds of rising chaos. End card explicitly
maps: await=async I/O, kitchen=thread/process pool, blocking=the sin. Config:
`{"rounds": [{"orders": [...], "patience": int}]}`.

**dragonGauntlet — "The Dragon" (final boss, Phase 3):**
Multi-phase fight, shared 5 heart-gems, dragon HP = 24, correct answer = 1
damage (2 during phase 3). Phase 1 "Breath of Questions": 10 rapid-fire
questions sampled evenly across ALL banks in `opts.banks`, 20s timer. Phase 2
"Wings of Deception": 8 bug-type questions only, 30s timer. Phase 3 "The
Riddle of Scale": 3 war-council-style scenario picks (config provides them,
same honest-stats format, single best answer + debrief). Defeat = 0 hearts.
Victory = HP 0. Emits missed/correct question ids for curse tracking (quiz
phases only). Dramatic: phase intro cards, dragon sprite (CSS/unicode art),
screen-shake on wounds, epic victory screen titled "THE TRIAL IS PASSED".
Config: `{"phase3": [...], "hp": 24, "hearts": 5}`.

## Curse Codex + polish (ENGINE-EXT)

- HUD gains a Curse button: `☠ n` (hidden at 0). Opens a codex panel listing
  active curses: bank, question prompt (truncated), hits `n/2`, flavor. Reads
  question text by fetching the curse's bank. Cleansed curses show in a
  collapsed "Cleansed" section (strikethrough, ✓).
- Drill end screen already reports; engine adds a distinct toast + SFX when a
  curse is cleansed, and a small ☠ floating pulse on the HUD button when new
  curses are added.
- NEW `sfx.js`: `Game.SFX.play(name)` for `click, correct, wrong, victory,
  defeat, levelup, cleanse` via WebAudio oscillators (no assets); mute toggle
  button in HUD persisted in `localStorage` (NOT in save state); resilient to
  autoplay policy (init on first user gesture). Minigames MAY call
  `window.Game.SFX && Game.SFX.play('correct')` — optional dependency only.
- Engine listens for minigame completion of dragons-keep trial to run the
  grand victory celebration (full-screen gold burst + title).

## Verification bar (all builders)

`node --check` all JS; JSON parses; every config field consumed by its
minigame actually exists in the shipped config (no dead references); concept
minigames' correct answers must be genuinely correct production judgments —
a content-verifier agent will adversarially review every claim, stat, and
debrief for technical accuracy (the no-bias rule applies to game content).
