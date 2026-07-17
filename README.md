# The Grand Trial

A private technical classroom for AI engineer / software engineer interview prep,
played as a 2D fantasy RPG. Minigames teach concepts; real code quests — written
by you, from blank files — gate all progression. Claude Code is the Game Master.

## Play

```
play.bat
```

(or `.venv\Scripts\python.exe game\run.py`) — the game opens at
http://127.0.0.1:8777.

First time here? Walk to **the Rune Plains**, run the daily drill, then open your
first quest. Quest briefs live in the track folders; you write code in `workspace/`
dirs; the Game Master (Claude Code in this repo) reviews it and awards XP.

## Setup (fresh clone)

```
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r game\requirements.txt
play.bat
```

## The rules of the world

- **You write the code.** The Game Master demos, hints, reviews — never solves.
- Every technology gets a full-honesty **Decision Card** — strengths, weaknesses,
  hardware impact, and cost on every axis.
- Quiz bosses gate lessons; missed questions become **Curses** that hunt you until
  cleansed.
- The save file (`game/state/progress.json`) is yours to edit. But the Dragon is real.

Full design: `docs/superpowers/specs/2026-07-17-grand-trial-design.md` ·
Curriculum: `CURRICULUM.md` · Your journal: `PROGRESS.md`
