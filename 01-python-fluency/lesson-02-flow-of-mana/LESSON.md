# L2 · Flow of Mana — Functions, Scope, Errors & Context Managers

*Region: The Rune Plains · Priority: P0 · Quests: 2 · Boss: The Warden of Flow*

---

> 🧙 **Coming from L1?** Good. If Python still feels foreign, spend ten minutes in
> **[L0 · First Steps](../lesson-00-first-steps/LESSON.md)** first. Keep the
> **[JS→Python Bridge Scroll](../PYTHON-CHEATSHEET.md)** (§10, §12) open, and press
> **«Ρώτα τον Δάσκαλο»** in the boss fight for a deep Greek explanation of anything
> that doesn't click.

## 0 · In plain words (start here)

L1 was about the *nouns* of Python — the containers that hold your data. L2 is
about the *verbs*: **functions** (reusable actions), and the machinery around
them — how you pass things in, where names live, and what happens when things go
wrong. You already do all of this in JavaScript every day. Here is the whole
lesson in four sentences:

- **A function** is a named, reusable block: `def cast(spell): ...`. It takes
  **arguments** in and hands a value **back** with `return`. (JS: `function`.)
- **Arguments** can be positional, named (keyword), have **defaults**, and you can
  accept "any number of extras" with `*args` / `**kwargs`. (JS: params, default
  params, `...rest`, options objects.)
- **Scope** is *where a name is visible*. Python looks it up in a fixed order
  (Local → Enclosing → Global → Built-in), and — the one real surprise —
  **assigning** to a name inside a function makes it local *for the whole
  function*. A **closure** is a function that remembers a name from the function
  that made it.
- **When things go wrong**, you don't crash — you `try` / `except` the specific
  error, `raise` your own when input is bad, and use a **context manager**
  (`with ...`) to guarantee cleanup happens no matter what. (JS: `try/catch`,
  `throw`, `try/finally`.)

Everything below opens the hood on those four. Read as deep as your energy allows;
the drills and the Warden will find whatever you skip.

---

## 1 · The concept

### 1.1 Functions & `return` — the silent `None`

```python
def add(a, b):
    return a + b

def greet(name):
    print(f"hi {name}")      # no return statement...
```

`add(2, 3)` is `5`. But `greet("x")` **returns `None`** — a function with no
`return` (or a bare `return`) hands back `None`, always. This is the single most
common beginner bug, and you already have the reflex from JS:

> 🌉 **From JS:** a JS function with no `return` gives `undefined`. Python gives
> `None`. Same trap, new spelling: `result = greet("x")` quietly puts `None` in
> `result`. If a function is supposed to give you a value, it needs `return`.

Functions are **first-class values** — you can pass them around, store them in a
list, return them from other functions. (Exactly like JS. This is what makes the
`key=` argument to `sorted` work — you hand `sorted` a function.)

### 1.2 Arguments: positional, keyword, defaults, `*args`, `**kwargs`

```python
def brew(base, *extras, strength=1, **notes):
    ...
```

Read that signature left to right — it's the full toolbox in one line:

- `base` — a normal **positional** parameter. `brew("water")`.
- `*extras` — **collects all remaining positional args into a tuple.** `brew("water",
  "mint", "sugar")` → `extras == ("mint", "sugar")`. (JS: `...rest`.)
- `strength=1` — a **keyword argument with a default**. Because it comes *after*
  `*extras`, it is **keyword-only**: you must write `strength=2`, never pass it
  positionally. (JS: a default param, but Python's keyword-only rule is stricter.)
- `**notes` — **collects any remaining keyword args into a dict.** `brew("water",
  flavor="lemon")` → `notes == {"flavor": "lemon"}`. (JS: the "options object"
  pattern, built into the language.)

Calling the other direction, `*` and `**` **spread**:

```python
args = ["water", "mint"]
opts = {"strength": 3}
brew(*args, **opts)          # spreads list into positionals, dict into keywords
```

> ⚠️ **The #1 interview gotcha lives here — the mutable default.**
> ```python
> def remember(item, log=[]):     # DON'T
>     log.append(item)
>     return log
> remember("a")   # ['a']
> remember("b")   # ['a', 'b']  <-- same list, leaked across calls!
> ```
> The default `[]` is created **once**, when `def` runs — not per call — so every
> call shares it. The fix is the sentinel pattern: `log=None`, then
> `if log is None: log = []` inside. Expect to be asked this. (Bridge Scroll §10.)

### 1.3 Scope — LEGB, and the "assignment makes it local" trap

When you use a name, Python searches four scopes in order — **L**ocal (this
function), **E**nclosing (a function that wraps this one), **G**lobal (the
module), **B**uilt-in (`len`, `print`, …):

```python
x = "global"
def outer():
    x = "enclosing"
    def inner():
        print(x)        # finds 'enclosing' — nearest wins
    inner()
```

The surprise for a JS dev: **assigning** to a name anywhere in a function makes
that name **local for the entire function** — even before the assignment line:

```python
count = 0
def bump():
    print(count)        # UnboundLocalError!
    count = count + 1   # this assignment makes 'count' local everywhere in bump
```

The read on line 1 refers to the *local* `count`, which doesn't exist yet. To
actually reassign an outer name you must say so: `global count` (module-level) or
`nonlocal count` (enclosing function). Usually the better fix is to **return the
new value** instead of mutating an outer one.

> 🌉 **From JS:** JS has block scope (`let`/`const` inside an `if` stays in the
> `if`). Python has **function** scope — an `if`/`for` does *not* make a new
> scope; names leak to the whole function. (Comprehensions are the one exception:
> their loop variable is private.)

### 1.4 Closures — functions that remember

A **closure** is a function that keeps a live link to a variable from the
function that created it:

```python
def make_counter(start=0):
    count = start
    def step():
        nonlocal count      # "reassign the enclosing count, don't make a local"
        count += 1
        return count
    return step

a = make_counter()
b = make_counter(10)
a()  # 1
a()  # 2
b()  # 11   <-- a and b each remember their OWN count
```

> 🌉 **From JS:** identical to `const makeCounter = (start=0) => { let count = start;
> return () => ++count; }`. The only new word is `nonlocal` — Python makes you
> *declare* that you're reassigning the outer variable (JS just lets you).

### 1.5 Errors — try / except / else / finally, and `raise`

You will hit errors constantly; handling them well is a senior signal.

```python
try:
    value = data["key"]           # might raise KeyError
except KeyError:
    value = default               # handle the specific failure
except (TypeError, ValueError) as e:
    print(f"bad input: {e}")      # catch several types; bind the object as e
else:
    print("no error happened")    # runs only if try succeeded
finally:
    close_resources()             # ALWAYS runs — success, failure, or return
```

- **Catch specific exceptions**, never a bare `except:` (that also swallows
  `Ctrl-C` and real bugs). Common ones: `KeyError`, `IndexError`, `ValueError`,
  `TypeError`, `ZeroDivisionError`, `FileNotFoundError`.
- **`raise`** your own when input is invalid: `raise ValueError("must be
  positive")`. (JS: `throw new Error(...)`.) Fail loudly at the boundary rather
  than returning a quiet wrong answer.
- **`finally`** always runs — even if the `try` block `return`s. It's for
  cleanup.

> 🌉 **From JS:** `try/catch/finally` → `try/except/finally`. Two upgrades: you
> catch **by exception type** (not one catch-all `catch (e)`), and there's an
> `else` clause for "the success path" so it's not lumped into the `try`.

**EAFP** — "Easier to Ask Forgiveness than Permission" — is the Pythonic style:
*try* the operation and handle the exception, rather than *checking* first
(LBYL, "Look Before You Leap"). `try: d[k] except KeyError:` is often preferred
over `if k in d:` because it's one lookup, not two, and avoids race conditions.

### 1.6 Context managers — `with`, and guaranteed cleanup

A **context manager** guarantees that setup and teardown happen as a pair, even
if the body explodes:

```python
with open("scroll.txt") as f:
    data = f.read()
# f is closed here — automatically, even if read() raised
```

`with EXPR as name:` calls `EXPR.__enter__()` (setup, its return value is bound to
`name`), runs the body, then **always** calls `EXPR.__exit__()` (teardown) — on
normal exit, on `return`, and on exception. It's `try/finally` with a name and a
reusable shape. You write one yourself with a class:

```python
class Ward:
    def __init__(self, log):
        self.log = log
    def __enter__(self):
        self.log.append("open")
        return self                 # bound to the 'as' name
    def __exit__(self, exc_type, exc, tb):
        self.log.append("close")    # runs even if the body raised
        return False                # False = do NOT swallow the exception
```

> 🌉 **From JS:** JS has no `with` for resources — you'd write `try { ... }
> finally { cleanup() }` by hand every time (TypeScript 5.2's `using` is the
> closest). Python's `with` bakes that pattern into an object you can reuse:
> files, locks, DB transactions, timers.

---

## 2 · Decision Cards (Law 2 — trade-offs, every axis)

### Card A — Return a value **vs** mutate in place

| Axis | Return a new value | Mutate the argument in place |
|---|---|---|
| **What it is** | `def scaled(xs, f): return [x*f for x in xs]` | `def scale(xs, f): for i in range(len(xs)): xs[i] *= f` |
| **Caller safety** | caller's data untouched — no surprises | caller's data changes (the `b = a` aliasing bug, from L1) |
| **Memory** | allocates a new collection (O(n) extra) | zero extra allocation |
| **Composability** | chains cleanly: `f(g(x))` | can't chain; returns `None` by convention |
| **When to prefer** | almost always — pure functions are easier to test & reason about | huge data where the copy is the bottleneck, or an explicit "in-place" API (`list.sort()`) |
| **Interview tell** | saying "I'll return a new list so I don't mutate the caller's" | mutating silently and getting bitten by aliasing |

### Card B — EAFP (`try/except`) **vs** LBYL (check first)

| Axis | EAFP — try, then handle | LBYL — check, then do |
|---|---|---|
| **Shape** | `try: d[k] except KeyError: ...` | `if k in d: d[k] else: ...` |
| **Lookups** | one (the access itself) | two (the check *and* the access) |
| **Races** | safe — nothing can change between check and use | the thing can change/vanish after your check (files, shared state) |
| **Readability** | best when the failure is *exceptional* (rare) | best when the "missing" case is *normal* and cheap (`d.get(k, default)`) |
| **Cost of the miss** | raising+catching is relatively expensive if failures are the common case | a cheap boolean check |
| **Pythonic default** | ✅ yes, for genuinely exceptional failures | fine for expected-optional (`.get`, `os.path.exists` with care) |

### Card C — Ad-hoc `try/finally` **vs** a context manager (`with`)

| Axis | `try/finally` by hand | Context manager (`with`) |
|---|---|---|
| **Guarantee** | cleanup runs if *you* remember to write `finally` every time | cleanup is part of the object — impossible to forget at the call site |
| **Reuse** | copy-pasted around each use | written once, reused everywhere (`with lock:`, `with open(...):`) |
| **Readability** | 4+ lines of boilerplate per use | one line; intent is obvious |
| **Cost** | none, but error-prone | a tiny class or `@contextmanager` to author once |
| **When to prefer** | a truly one-off cleanup | anything acquired-then-released: files, locks, connections, transactions, timers |

**Costs spelled out (all cards):** *Latency* — the return-a-copy style and
EAFP-on-hot-failures both cost cycles; measure before optimizing. *Memory* —
returning new collections trades RAM for safety, almost always worth it.
*Complexity* — context managers and pure functions **reduce** cognitive load,
which is the expensive kind of cost. *Ops burden* — forgotten cleanup (no
`with`) leaks file handles and connections in production; that's a 3am page.
*Dev cost* — writing the sentinel-default or the tiny CM class costs seconds and
is never the tiebreaker; correctness and clarity outrank it.

---

## 3 · Minimal demo — the four verbs in one tiny program

Type it, run it, watch the mutable-default trap and the closure both fire.

```python
def make_wallet(start=0):
    balance = start
    def spend(amount):
        nonlocal balance
        if amount > balance:                     # guard the boundary...
            raise ValueError("insufficient mana")  # ...and fail loudly
        balance -= amount
        return balance
    return spend

spend = make_wallet(10)
print(spend(4))          # 6
print(spend(3))          # 3
try:
    spend(99)            # raises ValueError
except ValueError as e:
    print(f"blocked: {e}")   # blocked: insufficient mana
print(spend(1))          # 2  — the wallet still remembers its balance
```

One function returns another (**closure**), the inner function reassigns an
enclosing name (**nonlocal**), it **raises** on bad input, and the caller
**catches** it — the whole lesson in twelve lines.

---

## 4 · Quests

The Trial accepts only your own runes: both quests start from a **blank file**;
the workspace holds only tests. Write, run, iterate, then summon the Game Master.

| Quest | Folder | You forge |
|---|---|---|
| **Q1 · The Mana Conduits** (100 XP) | [`quest-01/`](quest-01/brief.md) | `workspace/conduits.py` — `*args`/`**kwargs`, a correct default, a no-mutation transform, and a real closure |
| **Q2 · The Warded Gate** (100 XP, requires Q1) | [`quest-02/`](quest-02/brief.md) | `workspace/wards.py` — `try/except` that catches the right thing, `raise` on bad input, and a context-manager class that always cleans up |

Run tests from the repo root (macOS):
`.venv/bin/python -m pytest 01-python-fluency/lesson-02-flow-of-mana/quest-01/workspace -q`
(and likewise for `quest-02`).

---

## 5 · Interview angle

Functions are where live-coding interviewers watch your *habits*, not your
knowledge:

- **The mutable-default question is nearly guaranteed.** Be able to say *why*
  (evaluated once at def-time) and show the `None`-sentinel fix without pausing.
- **"What does this print?" with scope** — they'll hand you an `UnboundLocalError`
  or a closure-in-a-loop and watch you reason about LEGB out loud.
- **Error-handling judgment** — they probe whether you catch *specific*
  exceptions and whether you validate input at the boundary (`raise`) instead of
  returning a quiet wrong value. "Catch `Exception` broadly" is a red flag.
- **`with` fluency** — "how do you make sure the file/connection closes?" The
  reflex answer is a context manager, and knowing you can author one
  (`__enter__`/`__exit__` or `@contextmanager`) reads as senior.

Answer these **out loud**, no notes — the Game Master will spring them:

1. A function has no `return`. What do you get back, and what's the JS equivalent?
2. Why does `def f(x, acc=[])` leak state across calls, and what's the fix?
3. `*args` vs `**kwargs` — what does each collect, and how do you *spread* them
   back out at a call?
4. Walk me through LEGB. Then: why does reading a variable you later assign in the
   same function raise `UnboundLocalError`?
5. EAFP vs LBYL — give a case where `try/except` beats an `if` check, and one
   where the reverse is true.
6. What does a context manager guarantee that a plain function doesn't, and what
   two methods must it implement?

---

## 6 · Quiz boss — The Warden of Flow

Bank: `game/content/quizbanks/pf-l2.json` · fought in-game from the Rune Plains
panel once **both quests are passed** (the single Quiz Boss button advances to the
Warden after the Keeper of Runes falls). Wrong answers become **Curses** that
re-attack in daily drills until cleansed. The lesson completes when the Warden
falls — not when your code runs.

---

**Status:** ☐ not started · Quests: Q1 ☐ · Q2 ☐ · Boss ☐
*Next: open `quest-01/brief.md`, create `workspace/conduits.py`, and begin.*
