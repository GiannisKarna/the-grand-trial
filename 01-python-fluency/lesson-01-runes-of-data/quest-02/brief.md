# Quest 2 · The Shaping of Collections

> *Deeper in the Plains stands a toppled archive: a heap of spell-tablets, each
> etched with a name, a school, a level, and the components it burns. Scholars
> need the heap reshaped — filtered, grouped, inverted — and the Plains reward
> those who shape with a single clean stroke rather than a hundred chisel taps.*

**Region:** Rune Plains · **Lesson:** L1 · Runes of Data · **XP:** 100
**Requires:** Quest 1 · The Word-Hoard
**Your file:** `workspace/shaping.py` — **you create it from nothing.** The
workspace contains only the tests.

---

## The data shape

Every function receives `spells`: a list of dicts, each like

```
{"name": "Fireball", "school": "evocation", "level": 3,
 "components": ["bat guano", "sulfur"]}
```

Names are unique. `components` may be empty. The list may be empty. **No
function may mutate `spells` or the dicts inside it** — the tests check.

## The task

Create `workspace/shaping.py` with these five functions:

### 1. `filter_by_school(spells, school) -> list`

The spell **dicts** whose `school` matches exactly, in original order.
Unknown school → `[]`. A one-line list comprehension.

### 2. `names_by_level(spells) -> dict`

Map each level that appears → **sorted** list of spell names at that level.
Only levels that appear are keys. Empty input → `{}`.

### 3. `total_components(spells) -> set`

A single `set`: the union of every spell's components. Spells with no
components contribute nothing. Empty input → `set()`.

### 4. `invert_index(spells) -> dict`

The reverse lookup: component → **sorted** list of names of spells that use
it. (This is a search index — the same shape as an inverted index in a real
search engine.)

### 5. `strongest_per_school(spells) -> dict`

Map school → the **name** of its highest-level spell. If two spells in a
school tie on level, the alphabetically **first name** wins. Empty input → `{}`.

---

## Done-criteria

- [ ] All tests pass: `.venv\Scripts\python.exe -m pytest 01-python-fluency\lesson-01-runes-of-data\quest-02\workspace -q`
- [ ] Comprehensions used where they read naturally (1 certainly; 2–4 have
      clean comprehension or short-loop forms — choose what stays readable).
- [ ] **No imports.** Everything here is core-container work.
- [ ] Nothing mutates the input.
- [ ] You can say out loud what the tie-break rule in 5 costs you if you get
      it wrong silently. The Game Master will ask about your `key=` choices.

## Stuck?

Ask the Game Master. Hints escalate: nudge → pointer → pseudocode. Never the
answer — *the Trial accepts only your own runes.* The tests are the spec.
