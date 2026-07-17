# L1 · Runes of Data — Python Core Data Structures

*Region: The Rune Plains · Priority: P0 · Quests: 2 · Boss: The Keeper of Runes*

---

## 1 · The concept

Python gives you four core containers. They are not interchangeable bags — they
are four different machines with different mechanics, and picking the wrong one
is the most common silent performance bug in production Python.

**`list` is a dynamic array of pointers.** A contiguous C array holding 8-byte
references to objects that live elsewhere on the heap. Indexing is one pointer
arithmetic step — O(1). Appending is O(1) *amortized* because Python
over-allocates (~12.5% spare slots) and only occasionally reallocates-and-copies
the whole array. Inserting or deleting at the front is O(n): every pointer after
the hole must shift. Searching by value (`x in lst`) is a front-to-back scan —
O(n), every time, no exceptions.

**`tuple` is a fixed record.** Same pointer-array idea, but the slot count is
frozen at creation, so there is no over-allocation — it's the leanest container
Python has. Immutability makes it *hashable* (usable as a dict key or set
member) — but only if its contents are hashable. Think of a tuple as "a row":
`(user_id, page)`, `(lat, lon)`. Heterogeneous, positional, fixed.

**`dict` is a hash table.** A key is hashed; the hash picks a bucket; the value
is right there. Lookup, insert, delete: O(1) average, O(n) only under
adversarial hash collisions. Since CPython 3.6 the table is "compact": a small
index array points into a dense entry array, which is why dicts got smaller
*and* why insertion order is preserved (a language guarantee since 3.7). The
price of O(1): every entry stores a cached hash plus key and value pointers, and
the table keeps itself ≤ 2/3 full — you pay memory for speed.

**`set` is a hash table with no values.** Same O(1) membership machinery, plus
algebra: union `|`, intersection `&`, difference `-`. It deduplicates by
definition, and it promises **nothing** about order — iteration order depends on
hash values and table history, and for strings can change between runs (hash
randomization).

What "what actually happens in memory" buys you: a list of a million ints is
one 8 MB pointer array *plus* a million 28-byte int objects scattered on the
heap. Nothing about any Python container stores your numbers inline — every
element access is a pointer chase. That is why "just use a list" and "just use
a dict" are both wrong until you've asked *what operations dominate*.

## 2 · Decision Card — the four runes

| Axis | `list` | `tuple` | `dict` | `set` |
|---|---|---|---|---|
| **Underlying structure** | dynamic array of pointers, over-allocated | fixed array of pointers | open-addressed hash table (compact: index + dense entries) | open-addressed hash table, keys only |
| **Lookup** | by index O(1); **by value O(n)** | by index O(1); by value O(n) | by key O(1) avg | membership O(1) avg |
| **Append / insert** | append O(1) amortized; insert/del at front O(n) | — (build a new tuple, O(n)) | insert O(1) avg; occasional O(n) resize | add O(1) avg |
| **Memory (CPython 3.13, 64-bit, container only)** | 56 B empty + 8 B/slot (+ ~12.5% spare) | 40 B + exactly 8 B/slot | 64 B empty; ~37 B/entry at 1k entries | 216 B empty; ~33 B/entry at 1k entries |
| **Ordering** | insertion order, stable | fixed at creation | insertion order **guaranteed** (3.7+) | **none** — hash order, may vary between runs |
| **Mutability** | mutable | immutable (shallow! contents may mutate) | mutable | mutable (`frozenset` if you need hashable) |
| **Cache-friendliness** | pointer array is contiguous, but elements are scattered → poor locality vs C arrays; best of the four for linear walks | same, minus over-allocation | probing jumps around the table; entry array is dense, still pointer-chasing | same as dict |
| **When NOT to use** | membership tests in a loop; queue-from-the-front (use `collections.deque`); million-float math (use `array`/NumPy) | data that changes; records with many fields you access by name (dataclass/NamedTuple reads better) | when you only need membership (set is leaner); when you need sorted order (sort keys yourself); tiny fixed records | when order matters; when elements are unhashable; when you need to store data *with* each key (that's a dict) |
| **Interview trap** | `x in lst` inside a loop → accidental O(n·m); `b = a` aliases, doesn't copy | "tuples are immutable" — but `t[0].append(...)` works if slot 0 is a list; 1-tuple needs the comma `(x,)` | `d[k]` KeyError vs `d.get(k)` None; mutating while iterating raises RuntimeError | assuming dedupe preserves order — it doesn't; `{}` is an empty **dict**, not a set |

**Costs on every axis, spelled out.** Latency: dict/set buy O(1) lookups with
occasional resize spikes; list buys the fastest linear walks. Memory: dict
entries cost ~4–5× a list slot — a hash table is a paid subscription, worth it
only if you look things up. Complexity: sets make dedupe/intersection one
readable line, but hand order-sensitive code a subtle bug. Ops burden: none of
these persist or share across processes — that's a database's job; a giant dict
is not a cache strategy, it's a memory leak with confidence. Dev cost: list
comprehensions and dict lookups are idiomatic, instant to write — which is
exactly why the *thinking* step (what operation dominates?) gets skipped, and
dev cost never outranks the other axes.

## 3 · Minimal demo — the scan and the leap

The one snippet for this lesson. Type it yourself, run it, feel the cliff.

```python
import time

n = 100_000
needles = list(range(0, n, 10))          # 10,000 values to look up
haystack_list = list(range(n))
haystack_set = set(haystack_list)        # O(n) build cost — paid ONCE

t0 = time.perf_counter()
hits = sum(1 for x in needles if x in haystack_list)   # each 'in' scans → O(n·m)
t1 = time.perf_counter()
hits = sum(1 for x in needles if x in haystack_set)    # each 'in' hashes → O(m)
t2 = time.perf_counter()

print(f"list scan: {t1 - t0:.2f} s")     # ~2.3 s   on this machine
print(f"set hash : {t2 - t1:.4f} s")     # ~0.0003 s
```

Same data, same loop, ~8,000× difference — because `in` against a list walks
on average half of 100,000 slots per needle, while the set jumps straight to
the bucket. The intuition to keep: **a lookup inside a loop is a multiplication.**
10⁴ lookups × 10⁵ scans ≈ 10⁹ comparisons, versus 10⁴ hashes plus one 10⁵ build.
When someone says "it was fast in testing" — testing had 50 rows.

## 4 · Quests

The Trial accepts only your own runes: both quests start from a **blank file**;
the workspace holds only tests. Write, run, iterate, then summon the Game
Master for review.

| Quest | Folder | You forge |
|---|---|---|
| **Q1 · The Word-Hoard** (100 XP) | [`quest-01/`](quest-01/brief.md) | `workspace/word_hoard.py` — tallying, top-N ranking with a two-part sort key, ordered dedupe, grouping |
| **Q2 · The Shaping of Collections** (100 XP, requires Q1) | [`quest-02/`](quest-02/brief.md) | `workspace/shaping.py` — comprehension drills over spell records: filter, group, set-union, inverted index, max-with-tiebreak |

Run tests from the repo root:
`.venv\Scripts\python.exe -m pytest 01-python-fluency\lesson-01-runes-of-data\quest-01\workspace -q`
(and likewise for `quest-02`).

## 5 · Interview angle

Live-coding interviewers rarely ask "what is a list". They watch **which
container your hands reach for** and then probe:

- **Complexity probes** — "what's the complexity of that `in`?" the moment you
  scan a list inside a loop. The expected reflex: pre-build a set, and *say the
  build cost out loud* (O(n) once, amortized across lookups).
- **Aliasing gotchas** — they hand you code with `b = a` or a `def f(x, acc=[])`
  and ask why it misbehaves. Assignment never copies; defaults evaluate once.
- **"Why a dict here?"** — they want trade-off talk: O(1) lookup, paid for in
  memory-per-entry and lost sort order — not "dicts are fast".
- **Sorting fluency** — `key=lambda x: (-x[1], x[0])` for "count desc, then name
  asc" should leave your fingers without a pause; stability is the follow-up.

Sample verbal questions — answer these **out loud**, no notes; the Game Master
will spring them at session start:

1. Why is appending to a list O(1) *amortized*, and what happens on the bad append?
2. `x in my_list` vs `x in my_set` — mechanics of each, and when the set is the
   *wrong* choice anyway.
3. Copying `[[1, 2], [3, 4]]` with `.copy()` — what is shared, what is
   independent, and what would `deepcopy` change (and cost)?
4. Why can a tuple be a dict key when a list can't — and show a tuple that
   *also* can't.
5. A dict has a million entries; a list has the same million values. Roughly
   compare their memory, and say where the dict's extra bytes go.
6. Dedupe a list while preserving first-seen order — why is `list(set(xs))`
   wrong, what's the idiomatic fix, and what guarantee does it lean on?

## 6 · Quiz boss — The Keeper of Runes

Bank: `game/content/quizbanks/pf-l1.json` · 26 questions · fought in-game from
the Rune Plains panel once both quests are passed. Wrong answers become
**Curses** that re-attack in future drills until cleansed (answered correctly
twice). The lesson is complete when the Keeper falls — not when your code runs.

---

**Status:** ◐ in progress · Quests: Q1 ☐ · Q2 ☐ · Boss ☐
*Next: open `quest-01/brief.md`, create `workspace/word_hoard.py`, and begin.*
