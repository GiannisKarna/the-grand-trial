# L3 · Shaping Runes — Strings, Slicing, Sorting & Lambda

*Region: The Rune Plains · Priority: P0 · Quests: 2 · Boss: The Shaper of Names*

---

> 🧙 **Coming from L2?** Good — you can write functions now. If Python syntax is
> still shaky, keep **[L0](../lesson-00-first-steps/LESSON.md)** and the
> **[JS→Python Bridge Scroll](../PYTHON-CHEATSHEET.md)** (§4 strings, §8
> comprehensions, §10 sorting) open. Press **«Ρώτα τον Δάσκαλο»** in the boss
> fight for a deep Greek explanation of anything that doesn't click.

## 0 · In plain words (start here)

L1 was the nouns (containers), L2 the verbs (functions). L3 is the **craftsman's
bench**: taking raw text and raw lists and *shaping* them — cleaning strings,
cutting slices, and ordering things exactly how you want. This is the Python you
write most in an interview, because half of every problem is "parse this input"
and "sort this output." Four moves, all of which you already half-know from JS:

- **Strings** are immutable text with a rich toolkit: `strip`, `split`, `join`,
  `lower`, `replace`. Every operation returns a **new** string. (JS: same methods,
  different names.)
- **Slicing** — `s[start:stop:step]` — cuts a piece out of a string *or* a list
  with one compact syntax. `stop` is excluded; negatives count from the end;
  `[::-1]` reverses. (JS: like `slice`, but far more expressive.)
- **Sorting with a key** — `sorted(things, key=...)` — sorts by *whatever you
  compute*, not just the raw value: by length, by a field, by two fields at once.
  (JS: `arr.sort((a, b) => ...)`, but cleaner.)
- **`lambda`** — a tiny throwaway function written inline, mostly to feed `key=`.
  (JS: a short arrow function `x => ...`.)

Get these into your fingers and most "easy/medium" coding questions become
typing. Section 1 opens the hood; the Decision Cards pin the trade-offs.

---

## 1 · The concept

### 1.1 Strings — immutable, method-rich

```python
s = "  Fire Bolt  "
s.strip()                  # "Fire Bolt"      trim both ends
s.lower()                  # "  fire bolt  "  new string; s is unchanged
s.replace("Fire", "Ice")   # "  Ice Bolt  "
s.split()                  # ['Fire', 'Bolt'] split on any whitespace run
"a,b,c".split(",")         # ['a', 'b', 'c']  split on a delimiter
"-".join(["a", "b", "c"])  # "a-b-c"          JOIN IS A STRING METHOD
"cat" in "concatenate"     # True             substring test
```

Two things that trip a JS dev:

- **Strings are immutable** — `s.lower()` doesn't change `s`, it returns a new
  string. `s[0] = "x"` is a `TypeError`. (Same as JS strings, but it *matters*
  more here: building a big string with `+=` in a loop is O(n²) — collect parts
  in a list and `"".join(them)` instead. You saw this bite in an L1 curse.)
- **`join` is spelled backwards from your instinct.** It's `separator.join(list)`,
  not `list.join(separator)`. `"-".join(parts)`. This is *the* string gotcha for
  JS devs — burn it in.

> 🌉 **From JS:** `arr.join("-")` → `"-".join(arr)`. `str.trim()` → `str.strip()`.
> `str.toLowerCase()` → `str.lower()`. `str.includes(x)` → `x in str`. Template
> literals `` `${a}` `` → f-strings `f"{a}"`.

### 1.2 Slicing — one cut for strings *and* lists

`sequence[start:stop:step]` — `start` included, `stop` **excluded**, `step`
optional. Omit any part. Negative indices count from the end.

```python
s = "interview"
s[0]        # 'i'         single index
s[-1]       # 'w'         last character
s[:3]       # 'int'       first 3  (start defaults to 0)
s[-4:]      # 'view'      last 4
s[::2]      # 'itriw'     every 2nd
s[::-1]     # 'weivretni' reverse — the idiom
```

The identical syntax works on lists, and slicing a list makes a **new** list:

```python
nums = [0, 1, 2, 3, 4, 5]
nums[1:4]    # [1, 2, 3]      (stop 4 excluded)
nums[::-1]   # [5, 4, 3, 2, 1, 0]   reversed copy — original untouched
```

> ⚠️ The **exclusive stop** is the classic off-by-one. `s[1:4]` gives indices
> 1, 2, 3 — *not* 4. And with a negative step the walk goes backwards but stop is
> still excluded: `nums[4:1:-1]` is `[4, 3, 2]`, not `...1`.

### 1.3 Sorting with a key — the highest-leverage move in the lesson

`sorted(iterable, key=..., reverse=...)` returns a **new** sorted list. The `key`
is a function called on each element; Python sorts by its return value.

```python
words = ["oak", "fir", "elm", "cedar", "ash"]
sorted(words)                 # ['ash', 'cedar', 'elm', 'fir', 'oak']  (alphabetical)
sorted(words, key=len)        # ['oak', 'fir', 'elm', 'ash', 'cedar']  (by length)
sorted(words, reverse=True)   # descending
```

**Multi-level sort** is a tuple key — Python compares tuples element by element:

```python
scores = [("ana", 5), ("bo", 7), ("cy", 5)]
# count DESCENDING, then name ASCENDING — the interview classic:
sorted(scores, key=lambda p: (-p[1], p[0]))
# [('bo', 7), ('ana', 5), ('cy', 5)]
```

The `-p[1]` flips just the score to descending while the name stays ascending.
This one line should leave your fingers without a pause.

> 🌉 **From JS:** `arr.sort((a, b) => a.len - b.len)` → `sorted(arr, key=len)`.
> Python's `key` computes a *value to sort by* (called once per element), instead
> of a comparator called on pairs — simpler and faster. And remember from L1:
> `list.sort()` sorts **in place and returns `None`**; `sorted()` returns a new
> list. Reach for `sorted()` when you want a value back.

Python's sort is **stable**: elements whose keys tie keep their original order.
That's what makes "sort by secondary key, then by primary" work, and why the
tuple-key trick is reliable.

### 1.4 `lambda` — a function with no name

A `lambda` is a one-expression function you write inline. Its whole job is to be
handed to something like `key=` or `max(...)`:

```python
key = lambda p: (-p[1], p[0])   # same as a def that returns that tuple
max(scores, key=lambda p: p[1]) # ('bo', 7) — the pair with the highest score
```

Rule of thumb: if it fits in one short expression and you use it once, `lambda`.
If it needs a statement, a name, or reuse — write a `def`. (JS: `lambda p: p[1]`
is `p => p[1]`.)

### 1.5 `itertools` — a few power tools

`itertools` is the standard-library toolbox for iterators. You don't need many;
these three earn their keep:

```python
from itertools import accumulate, chain, groupby

list(accumulate([3, 1, 4, 1, 5], max))   # [3, 3, 4, 4, 5]  running max
list(chain([1, 2], [3, 4]))               # [1, 2, 3, 4]     flatten two iterables
```

`groupby` groups **consecutive** equal keys — so you almost always `sorted(...)`
first, or it will "miss" groups that aren't adjacent:

```python
words = sorted(["ape", "ant", "bee", "bat"])   # SORT FIRST — groupby needs adjacency
for letter, group in groupby(words, key=lambda w: w[0]):
    print(letter, list(group))
# a ['ant', 'ape']
# b ['bat', 'bee']
```

> ⚠️ `groupby` on **unsorted** input silently gives wrong groups — its #1 gotcha.
> For plain counting, `collections.Counter(words)` is usually clearer than
> `groupby`.

---

## 2 · Decision Cards (Law 2 — trade-offs, every axis)

### Card A — `sorted(x)` **vs** `x.sort()`

| Axis | `sorted(x)` | `x.sort()` |
|---|---|---|
| **Returns** | a **new** list | `None` (sorts in place) |
| **Works on** | any iterable (tuples, sets, dict keys, generators) | only a `list` |
| **Original** | untouched — safe to sort a caller's data | mutated — the aliasing risk from L1 |
| **Memory** | allocates a new list (O(n)) | zero extra allocation |
| **When to prefer** | almost always — you want a value and no surprises | huge list where the copy is the bottleneck and you own the list |
| **Interview tell** | `top = sorted(items, key=...)[:n]` | `x = items.sort()` → `None` bug |

### Card B — Build a string: `"".join(parts)` **vs** `+=` in a loop

| Axis | `"".join(parts)` | `result += piece` in a loop |
|---|---|---|
| **Complexity** | O(total length) — one pass | O(n²) worst case (strings are immutable → may copy each time) |
| **Readability** | one idiomatic line | familiar but subtly wrong at scale |
| **Memory** | one final allocation | many intermediate strings churned |
| **When it's fine** | always the safe default | tiny, fixed number of pieces |
| **Interview tell** | "I'll collect parts and join" | reviewer flags the loop for large inputs (an L1 curse) |

### Card C — `key=` function **vs** a comparator

| Axis | `key=` (Python's way) | comparator `cmp` (JS's way) |
|---|---|---|
| **Calls** | key computed **once** per element (n calls) | comparator called on **pairs** (~n log n calls) |
| **Speed** | faster — the "decorate-sort-undecorate" pattern | slower, more function-call overhead |
| **Multi-level** | a tuple key: `key=lambda p: (-p[1], p[0])` | nested if/else in the comparator |
| **Availability** | the default and idiomatic | needs `functools.cmp_to_key` to use at all |
| **When to prefer** | ✅ essentially always | only when order can't be expressed as a computed key |

**Costs spelled out:** *Latency* — `join` and `key=` are the fast paths; the `+=`
loop and comparators are the slow ones. *Memory* — `sorted`/slicing trade a copy
for safety, almost always worth it. *Complexity* — a tuple key replaces a page of
branching with one line, which is the cheap kind of clever. *Ops burden* — the
O(n²) string build is the one that pages you at scale. *Dev cost* — all the
idiomatic forms are *shorter* to write, so dev cost never argues against them here.

---

## 3 · Minimal demo — parse, shape, order, render

Type it, run it — the whole lesson in one tiny pipeline.

```python
text = "the quick brown fox the lazy dog the end"

words = text.split()                                   # tokenize
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1                   # tally (L1 muscle)

# rank: count DESC, then word ASC — the tuple-key classic
ranked = sorted(counts.items(), key=lambda p: (-p[1], p[0]))
top2 = ranked[:2]                                      # slice the top 2

line = ", ".join(f"{w}×{n}" for w, n in top2)          # join, not += 
print(line)                # the×3, brown×1
print("reversed:", text.split()[-1][::-1])   # slice last word, reverse it: 'dne'
```

Tokenize, tally, rank with a tuple key, slice the top, and `join` the output —
that pipeline shows up in a huge fraction of live-coding problems.

---

## 4 · Quests

The Trial accepts only your own runes: both quests start from a **blank file**;
the workspace holds only tests. Write, run, iterate, then summon the Game Master.

| Quest | Folder | You forge |
|---|---|---|
| **Q1 · The Runesmith's Lexicon** (100 XP) | [`quest-01/`](quest-01/brief.md) | `workspace/lexicon.py` — normalize, slugify, initials, reverse-words: strings, `split`/`join`, slicing |
| **Q2 · The Sorting Stones** (100 XP, requires Q1) | [`quest-02/`](quest-02/brief.md) | `workspace/sorting.py` — sort by length, by two keys, by a computed key: `sorted` + `lambda` fluency |

Run tests from the repo root (macOS):
`.venv/bin/python -m pytest 01-python-fluency/lesson-03-shaping-runes/quest-01/workspace -q`
(and likewise for `quest-02`).

---

## 5 · Interview angle

This is the lesson interviewers watch your *fingers* on:

- **The tuple-key sort is a near-guaranteed sub-task.** `sorted(items, key=lambda
  p: (-p[1], p[0]))` for "count desc, then name asc" should flow without pausing —
  and be ready to say "Python's sort is stable, so ties keep input order."
- **String building** — if you write `s += ...` in a loop, expect "what's the
  complexity?" The answer they want: O(n²) worst case, use `"".join`.
- **Slicing off-by-ones** — "reverse this", "last k elements", "every other" —
  `[::-1]`, `[-k:]`, `[::2]` should be reflexes, and you should know `stop` is
  exclusive.
- **`join` direction** — writing `list.join(sep)` instead of `sep.join(list)` is a
  small tell that you don't write much Python. Get it automatic.

Answer these **out loud**, no notes — the Game Master will spring them:

1. Sort `[("ana", 5), ("bo", 7), ("cy", 5)]` by score descending, then name
   ascending — say the `key=` you'd write, and why the `-` works.
2. Why is `"".join(parts)` preferred over `+=` in a loop? What's the complexity of
   each?
3. `s[1:4]`, `s[-3:]`, `s[::-1]` — what does each give, and which index is
   excluded?
4. `sorted()` vs `list.sort()` — what does each return, and when do you pick which?
5. What does "stable sort" mean, and how do you use stability for a multi-key sort
   without a tuple key?
6. When would you write a `lambda` vs a named `def`?

---

## 6 · Quiz boss — The Shaper of Names

Bank: `game/content/quizbanks/pf-l3.json` · fought in-game from the Rune Plains
panel once **both quests are passed** (the single Quiz Boss button advances to the
Shaper after the Warden of Flow falls). Wrong answers become **Curses** that
re-attack in daily drills until cleansed. The lesson completes when the Shaper
falls — not when your code runs.

---

**Status:** ☐ not started · Quests: Q1 ☐ · Q2 ☐ · Boss ☐
*Next: open `quest-01/brief.md`, create `workspace/lexicon.py`, and begin.*
