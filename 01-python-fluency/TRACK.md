# The Rune Plains — Track 01 · Python Fluency

> *Grass to the horizon, broken by standing stones older than any kingdom. Every
> rune here is small — a word, a slice, a sort — and every one of them will be
> carved into your hands before the Dragon ever sees your face. The Plains are
> the first region and the only one you never truly leave: you return every
> session, and the stones remember whether you hesitated.*

## Why this region exists

Live-coding interviews are not won by knowing Python — you already know Python.
They are won by **fluency**: writing correct, idiomatic code from a blank
editor, while talking, under a clock, without an agent autocompleting the next
line. The gap between "I understand comprehensions" and "my hands produce
`sorted(counts.items(), key=lambda p: (-p[1], p[0]))` while I explain the
tie-break" is exactly the gap this region closes. Fluency also means the
reflexes: seeing `b = a` and hearing an alarm, reaching for a set *before* the
nested loop is written, saying complexity out loud unprompted.

## How the Plains work

- **Daily Drill (Rune Trials).** Every session opens here: ~10 quick questions
  in-game — predict the output, spot the bug, true or false. 2 XP per correct
  answer, and each drilled day feeds your ember streak. Active **Curses**
  (questions you missed before) attack first, until you've beaten each twice.
- **Quests.** Real code, real repo folders, **blank files**. Each quest folder
  has a `brief.md` (the spec) and a `workspace/` containing only tests. You
  write the module; pytest judges; the Game Master reviews code + asks
  "why" questions before marking it passed. 100 XP each.
- **Quiz Boss.** Each lesson ends with a boss fight (12 questions, boss HP vs
  your 3 hearts) gated behind the lesson's quests. Beating the boss — not
  passing the tests — completes the lesson. Missed questions become Curses.

## Lessons (mirrors CURRICULUM.md · track 01)

| Status | Pri | Lesson | Contents |
|---|---|---|---|
| ◐ | P0 | [L1 · Runes of Data](lesson-01-runes-of-data/LESSON.md) | Core data structures: list/dict/set/tuple, comprehensions, iteration idioms, mutability traps |
| ☐ | P0 | L2 · Flow of Mana | Functions, args/kwargs, scope, closures, error handling, context managers |
| ☐ | P0 | L3 · Shaping Runes | Strings, slicing, sorting with keys, lambda, itertools basics |
| ☐ | P1 | L4 · Sigils of Order | Classes, dataclasses, dunder methods, typing/type hints |
| ☐ | P1 | L5 · Time Trials | Timed katas: solve small problems in <15 min, interview-style |
| ☐ | P2 | L6 · Deep Runework | Generators, decorators, functools, performance basics |

Only the Game Master marks a lesson ☑ — and only after its boss has fallen.

**Next up:** `lesson-01-runes-of-data/LESSON.md`
