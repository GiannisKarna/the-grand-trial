# Quest 2 · The Warded Gate

> *The gate to the Warden's hall is trapped. A careless mage who forces it is
> unmade; a wise one wards each step — dividing without shattering on zero,
> reading only the runes that are truly numbers, refusing a spell of negative
> power, and above all sealing the gate behind them whether they pass in triumph
> or are thrown back. Carve the wards, and the gate opens.*

**Region:** Rune Plains · **Lesson:** L2 · Flow of Mana · **XP:** 100
**Your file:** `workspace/wards.py` — **you create it from nothing.** The
workspace contains only the tests.

---

## The task

Create `workspace/wards.py` implementing three functions and one class below. No
imports are needed.

### 1. `safe_divide(a, b)`

Divide `a` by `b`, but **never crash** on a zero divisor.

- `safe_divide(6, 2)` → `3.0`; `safe_divide(-9, 3)` → `-3.0`.
- `safe_divide(5, 0)` → `None` (catch the `ZeroDivisionError` — don't check with
  an `if`; use `try`/`except`).

### 2. `parse_ints(tokens) -> list`

Given a list of strings, return the list of those that are valid integers, in
order, **skipping** the ones that aren't.

- `parse_ints(["1", "x", "3"])` → `[1, 3]`.
- `parse_ints(["-2", "4", "oops", "0"])` → `[-2, 4, 0]`.
- `parse_ints(["4.5", "5"])` → `[5]` (`"4.5"` is not a valid `int`).
- `parse_ints([])` → `[]`.
- Use `int(token)` inside a `try`/`except ValueError` — let the failures skip
  themselves, don't hand-write a validator.

### 3. `require_positive(n)`

Guard a boundary: return `n` if it is positive, otherwise **raise**.

- `require_positive(5)` → `5`.
- `require_positive(0)` and `require_positive(-3)` → **raise `ValueError`** whose
  message contains the word `"positive"`.

### 4. `Ward` — a context manager

A class usable in a `with` block that records what happened to a **log** list.

- `Ward(log)` stores the given list.
- On entering the `with` block it appends `"open"` to the log, and its
  `__enter__` returns the `Ward` instance.
- On leaving — **whether the block finished normally or raised** — it appends
  `"close"`.
- It must **not** swallow exceptions: an error raised inside the `with` block
  still propagates out.

```python
log = []
with Ward(log):
    log.append("work")
# log == ["open", "work", "close"]
```

Implement it with `__init__`, `__enter__`, and `__exit__`.

---

## Done-criteria

- [ ] All tests pass: `.venv/bin/python -m pytest 01-python-fluency/lesson-02-flow-of-mana/quest-02/workspace -q`
- [ ] `safe_divide` uses `try`/`except`, not an `if b == 0` check.
- [ ] `parse_ints` catches the **specific** `ValueError`, not a bare `except:`.
- [ ] `Ward` appends `"close"` even when the block raises, and does **not**
      suppress the exception (`__exit__` returns a falsy value).
- [ ] You can explain, out loud: EAFP vs LBYL, why you catch `ValueError`
      specifically, and what `__enter__`/`__exit__` guarantee. The Game Master
      **will** ask.

## Stuck?

Ask the Game Master — hints escalate (nudge → pointer → pseudocode) and never the
answer. Read the tests; they are the precise spec. *The Trial accepts only your
own runes.*
