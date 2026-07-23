# Quest 2 · The Sorting Stones

> *Four standing stones, and on each a different law of order. One ranks by size,
> one by score with a tie-breaker, one by the name a mage is remembered by, one by
> the music in a word. Speak the right `key` to each stone and the Shaper of Names
> will grant you audience.*

**Region:** Rune Plains · **Lesson:** L3 · Shaping Runes · **XP:** 100
**Your file:** `workspace/sorting.py` — **you create it from nothing.** The
workspace contains only the tests.

---

## The task

Create `workspace/sorting.py` implementing the four functions below. No imports
needed. Every one is a single `sorted(...)` call with the right `key=` — that is
the whole lesson. None may mutate its input.

### 1. `by_length(words) -> list`

Sort words by length **ascending**, ties broken **alphabetically**.

- `by_length(["bb", "a", "ccc", "aa", "b"])` → `["a", "b", "aa", "bb", "ccc"]`.
- `by_length([])` → `[]`.
- Must not mutate the input.

### 2. `top_scorers(scores, n) -> list`

`scores` is a list of `(name, score)` tuples. Return the **names** of the top `n`,
ranked by score **descending**, ties broken by name **ascending**.

- `top_scorers([("ana", 5), ("bo", 7), ("cy", 5)], 2)` → `["bo", "ana"]`.
- `n = 0` → `[]`; if `n` exceeds the list, return all names in order.
- Tuple-key hint: `key=lambda p: (-p[1], p[0])`, then slice the top `n`, then keep
  the names.

### 3. `sort_by_last(names) -> list`

`names` is a list of `"First Last"` strings. Sort by **last** name (the last
word), ties broken by the **full** string.

- `sort_by_last(["Ada Lovelace", "Grace Hopper", "Alan Turing"])`
  → `["Grace Hopper", "Ada Lovelace", "Alan Turing"]`.
- `sort_by_last(["Bob Smith", "Ann Smith"])` → `["Ann Smith", "Bob Smith"]`.

### 4. `sort_by_vowels(words) -> list`

Sort by number of vowels (`a e i o u`) **descending**, ties broken
**alphabetically**.

- `sort_by_vowels(["sky", "area", "be", "ee"])` → `["area", "ee", "be", "sky"]`.
- `sort_by_vowels(["ba", "ab"])` → `["ab", "ba"]` (both have one vowel → alphabetical).

---

## Done-criteria

- [ ] All tests pass: `.venv/bin/python -m pytest 01-python-fluency/lesson-03-shaping-runes/quest-02/workspace -q`
- [ ] Each function is essentially one `sorted(...)` with a `key=` (no manual
      bubble-sorting, no mutating the input).
- [ ] You can explain, out loud: how a tuple key does a two-level sort, why `-p[1]`
      flips only the score to descending, and why Python's stable sort matters.
      The Game Master **will** ask.

## Stuck?

Ask the Game Master — hints escalate (nudge → pointer → pseudocode) and never the
answer. Read the tests; they are the precise spec. *The Trial accepts only your
own runes.*
