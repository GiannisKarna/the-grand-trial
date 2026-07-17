# Quest 1 · The Word-Hoard

> *The Rune Plains stretch before you, littered with weathered stones. Each stone
> bears words in the old tongue — but the Plains' catalog was lost in the Sundering.
> The Keeper of Runes will not even look at you until you can rebuild it: count the
> words, rank them, cull the duplicates, and shelve them by their first letter.*

**Region:** Rune Plains · **Lesson:** L1 · Runes of Data · **XP:** 100
**Your file:** `workspace/word_hoard.py` — **you create it from nothing.** The
workspace contains only the tests.

---

## The task

Create `workspace/word_hoard.py` implementing the four functions below. No
imports are needed (you may use `collections` if you want, but you shouldn't
need it).

### 1. `tally_words(text) -> dict`

Count word frequencies in `text` (a string, possibly empty).

- Split on whitespace (any run of spaces/tabs/newlines — `str.split()` does this).
- Strip the punctuation characters `.,!?;:` from **both ends** of each token
  (`str.strip` accepts a set of characters). Punctuation *inside* a word stays:
  `don't` and `co-op` are single words.
- Lowercase every word.
- Tokens that are empty after stripping (e.g. `"..."`) are dropped.
- Return a dict mapping word → count. Empty/whitespace-only text → `{}`.

### 2. `top_words(text, n) -> list`

The `n` most frequent words in `text`, as a list of `(word, count)` tuples.

- Same tokenization rules as `tally_words` (reuse it — don't re-implement).
- Sort by count **descending**, ties broken by word **ascending** (alphabetical).
- Return at most `n` entries; fewer if the text has fewer distinct words.
  `n = 0` → `[]`.
- Hint direction (not a hint): one `sorted(...)` call with the right `key=`
  can do the whole ordering.

### 3. `unique_in_order(items) -> list`

Deduplicate a list, keeping only the **first** occurrence of each value, in
original order. `[3, 1, 3, 2] -> [3, 1, 2]`. Works for any hashable items
(ints, strings...). Must **not** mutate the input list. Empty list → `[]`.

### 4. `group_by_first_letter(words) -> dict`

Group a list of non-empty words by first letter.

- Key: the **lowercase** first character of the word.
- Value: the list of those words **as given** (original casing preserved),
  sorted with plain `sorted()`.
- Empty input list → `{}`.

---

## Done-criteria

- [ ] All tests pass: `.venv\Scripts\python.exe -m pytest 01-python-fluency\lesson-01-runes-of-data\quest-01\workspace -q`
- [ ] `top_words` reuses `tally_words` instead of duplicating tokenization.
- [ ] No function mutates its input.
- [ ] You can explain, out loud, the complexity of each function and why you
      chose each container. The Game Master **will** ask.

## Stuck?

Ask the Game Master. Hints escalate — nudge first, then a pointer, then
pseudocode — and never the answer. That is the law of the Trial: *it accepts
only your own runes.* Read the tests; they are the precise spec.
