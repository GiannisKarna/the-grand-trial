# Quest 1 · The Mana Conduits

> *Mana does not flow on its own — it runs through conduits the mages carve, each
> shaped for one job: some gather many streams into one, some tag a stream with
> its properties, some copy a flow without touching the source, and some remember
> how much has passed. Carve the four conduits, and the Warden will grant you
> audience.*

**Region:** Rune Plains · **Lesson:** L2 · Flow of Mana · **XP:** 100
**Your file:** `workspace/conduits.py` — **you create it from nothing.** The
workspace contains only the tests.

---

## The task

Create `workspace/conduits.py` implementing the four functions below. No imports
are needed.

### 1. `channel(*amounts) -> number`

Sum **any number** of amounts passed as separate arguments.

- `channel(1, 2, 3)` → `6`; `channel(10, 5)` → `15`; `channel(7)` → `7`.
- `channel()` (no arguments) → `0`.
- Works with floats too: `channel(1.5, 2.5)` → `4.0`.
- Use a `*args`-style parameter to collect the amounts.

### 2. `enchant(name, **traits) -> dict`

Build an item dict from a required `name` plus any number of keyword traits.

- `enchant("Sword", glow=True, dmg=5)` → `{"name": "Sword", "glow": True, "dmg": 5}`.
- `enchant("Bare")` → `{"name": "Bare"}` (no traits).
- The result must always start with the `"name"` key, then include every trait
  passed. Use a `**kwargs`-style parameter.

### 3. `scaled(values, factor=2) -> list`

Return a **new** list with each value multiplied by `factor`.

- `scaled([1, 2, 3])` → `[2, 4, 6]` (default `factor` is `2`).
- `scaled([1, 2, 3], 10)` → `[10, 20, 30]`.
- `scaled([])` → `[]`.
- Must **not** mutate the input list, and must return a *new* list object (never
  the same one you were given).

### 4. `make_counter(start=0) -> function`

Return a **function of no arguments** that counts upward each time it is called.

- The first call returns `start`, the next returns `start + 1`, and so on:
  `c = make_counter()` → `c()` is `0`, then `1`, then `2`.
- `make_counter(10)` → first call `10`, then `11`.
- Two counters are **independent** — each remembers its own count. (This is a
  closure; you will need `nonlocal`.)

---

## Done-criteria

- [ ] All tests pass: `.venv/bin/python -m pytest 01-python-fluency/lesson-02-flow-of-mana/quest-01/workspace -q`
- [ ] `scaled` neither mutates its input nor returns the same list object.
- [ ] `make_counter` produces independent counters (no shared state between them).
- [ ] You can explain, out loud: what `*args` and `**kwargs` collect, why `scaled`
      returns a new list instead of mutating, and how the closure in `make_counter`
      remembers its count. The Game Master **will** ask.

## Stuck?

Ask the Game Master — hints escalate (nudge → pointer → pseudocode) and never the
answer. Read the tests; they are the precise spec. *The Trial accepts only your
own runes.*
