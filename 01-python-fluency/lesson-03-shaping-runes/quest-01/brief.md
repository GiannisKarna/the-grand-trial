# Quest 1 · The Runesmith's Lexicon

> *The Lexicon is the book every runesmith keeps: raw names come in crooked —
> padded with whitespace, shouting in capitals, jumbled in order — and must leave
> it clean, slugged, initialled, and reordered. Shape the four entries, and the
> book accepts your hand.*

**Region:** Rune Plains · **Lesson:** L3 · Shaping Runes · **XP:** 100
**Your file:** `workspace/lexicon.py` — **you create it from nothing.** The
workspace contains only the tests.

---

## The task

Create `workspace/lexicon.py` implementing the four functions below. No imports
needed. Lean on `str.split()`, `str.join`, slicing, `.lower()`/`.upper()`.

### 1. `normalize(text) -> str`

Clean a string: trim the ends, collapse every run of internal whitespace to a
single space, and lowercase it.

- `normalize("  Hello   World  ")` → `"hello world"`.
- `normalize("a\tb\nc")` → `"a b c"` (tabs/newlines are whitespace).
- `normalize("")` → `""`.
- Hint direction (not a hint): `str.split()` with no argument already splits on
  any whitespace run and drops empties.

### 2. `slugify(title) -> str`

Turn a title into a URL-style slug: lowercase, words joined by single hyphens.

- `slugify("Fire Bolt")` → `"fire-bolt"`.
- `slugify("  The  Great  Library ")` → `"the-great-library"`.
- `slugify("")` → `""`.

### 3. `initials(full_name) -> str`

The uppercase first letter of each word, joined with nothing.

- `initials("ada lovelace")` → `"AL"`.
- `initials("grace brewster murray hopper")` → `"GBMH"`.
- `initials("solo")` → `"S"`; `initials("")` → `""`.

### 4. `reverse_words(sentence) -> str`

Reverse the **order of the words** (not the letters), single-spaced.

- `reverse_words("the quick fox")` → `"fox quick the"`.
- `reverse_words("one")` → `"one"`; `reverse_words("")` → `""`.
- Extra whitespace collapses: `reverse_words("  pad   words  ")` → `"words pad"`.
- Slicing hint: a list of words has a one-move reverse.

---

## Done-criteria

- [ ] All tests pass: `.venv/bin/python -m pytest 01-python-fluency/lesson-03-shaping-runes/quest-01/workspace -q`
- [ ] You used `str.split()` / `str.join` rather than manual character loops.
- [ ] You can explain, out loud: why `join` is called on the separator, why
      `split()` with no argument is the right tokenizer here, and what
      `[::-1]` does. The Game Master **will** ask.

## Stuck?

Ask the Game Master — hints escalate (nudge → pointer → pseudocode) and never the
answer. Read the tests; they are the precise spec. *The Trial accepts only your
own runes.*
