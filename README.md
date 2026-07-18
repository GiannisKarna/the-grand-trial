# The Grand Trial

A private technical classroom for AI engineer / software engineer interview prep,
played as a 2D fantasy RPG. Minigames teach concepts; real code quests — written
by you, from blank files — gate all progression. Claude Code is the Game Master.

## Play

Windows:
```
play.bat
```
(or `.venv\Scripts\python.exe game\run.py`)

macOS/Linux:
```
./play.sh
```
(or `.venv/bin/python game/run.py`)

On macOS, double-click **`play.command`** in Finder to launch without a terminal
(double-clicking `play.sh` instead opens it as a text file and may prompt to
install Xcode — that's Finder's default handler for `.sh`, not a real
requirement, and it's harmless to dismiss).

— the game opens at http://127.0.0.1:8777.

First time here? Walk to **the Rune Plains**, run the daily drill, then open your
first quest. Quest briefs live in the track folders; you write code in `workspace/`
dirs; the Game Master (Claude Code in this repo) reviews it and awards XP.

Beyond the Plains (each region unsealed by the Game Master as you progress):
the **Gatekeeper's Forge** and its async tavern, the **Great Library** with RAG
scroll-trials and the Summoning Circles, the **War Council**'s Decision-Card
battles, and at the end of the road — **Veldrath, the Dragon**: a three-phase
mock-interview gauntlet. Miss questions anywhere and they become Curses (☠ in
the HUD) that hunt you until cleansed.

## Setup (fresh clone)

Windows:
```
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r game\requirements.txt
play.bat
```

macOS/Linux:
```
python3 -m venv .venv
.venv/bin/python -m pip install -r game/requirements.txt
./play.sh
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
