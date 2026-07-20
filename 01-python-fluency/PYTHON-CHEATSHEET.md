# Python Syntax — the JS→Python Bridge Scroll

*A lookup reference for Dimitris. You already know these machines from JavaScript;
this maps what you do in JS to how Python spells it. Keep it open while you forge
quests — glance, don't memorize. Fluency comes from writing, not reading.*

> **How to read this:** left column = the JS you know, right column = the Python.
> Every snippet here has been executed on Python 3.14 — the outputs are real.

---

## 0 · The three things that feel weird coming from JS

1. **Indentation IS the block.** No `{ }`. A colon `:` opens a block; consistent
   indentation (4 spaces) is the block; dedent closes it. Whitespace is syntax.
2. **No `let`/`const`/`var`.** You just assign: `x = 5`. No declaration keyword.
   (There's no true `const`; convention is `UPPER_CASE` = "don't reassign".)
3. **`snake_case`, not `camelCase`.** Functions and variables are `snake_case` by
   convention; `CamelCase` is reserved for classes.

```python
def greet(name):          # ':' opens the block
    if name:              # ':' again
        print(f"hi {name}")   # 4-space indent = inside the if
    return name           # dedent = back in the function
```

---

## 1 · Printing, comments, running

| JavaScript | Python |
|---|---|
| `console.log(x)` | `print(x)` |
| `console.log(a, b)` | `print(a, b)` → space-separated |
| `` `${name} is ${age}` `` | `f"{name} is {age}"` → **f-string** (Python uses no `$`) |
| `// comment` | `# comment` |
| `/* block */` | `"""triple-quoted string"""` (also used as docstrings) |
| `node file.js` | `python file.py` (here: `.venv/bin/python file.py`) |

**f-strings** — your template literals, better:
```python
name, age = "Dimitris", 4
print(f"{name} is {age}")        # Dimitris is 4
print(f"{age * 12} months")      # expressions inline: 48 months
print(f"{3.14159:.2f}")          # format spec: 3.14
print(f"{name=}")                # debug form: name='Dimitris'
```

---

## 2 · Variables, types, truthiness

| JavaScript | Python |
|---|---|
| `let x = 5` | `x = 5` |
| `const PI = 3.14` | `PI = 3.14` (naming convention only) |
| `typeof x` | `type(x)` → `<class 'int'>`; `type(x) is int` |
| `x instanceof Foo` | `isinstance(x, Foo)` |
| `null` / `undefined` | `None` (there's only one "nothing") |
| `true` / `false` | `True` / `False` (capitalized!) |
| `Number("5")`, `String(5)` | `int("5")`, `str(5)`, `float("5")` |

**Truthiness** — mostly like JS, with a cleaner rule: **empty collections are falsy.**
```python
if not my_list:      # True when the list is EMPTY — idiomatic "is it empty?"
    print("empty")
# Falsy: 0, 0.0, "", [], {}, set(), (), None, False
# Everything else is truthy.
```

**`==` vs `is`** (a real interview trap — you saw it in the quiz):
```python
a == b     # equal VALUE  (use this ~always) — like JS ===
a is b     # same OBJECT in memory — reserve for:  x is None
```

---

## 3 · Operators

| JavaScript | Python | Note |
|---|---|---|
| `===` / `!==` | `==` / `!=` | Python `==` compares by value; no `===` needed |
| `&&` `\|\|` `!` | `and` `or` `not` | words, not symbols |
| `x ? a : b` | `a if x else b` | ternary, reordered |
| `x++` | `x += 1` | **no `++` or `--` in Python** |
| `Math.floor(a/b)` | `a // b` | integer (floor) division |
| `a % b` | `a % b` | modulo |
| `Math.pow(a,b)` / `a**b` | `a ** b` | exponent |
| `a ?? b` | `a if a is not None else b` | no `??`; `a or b` if empty-is-ok |
| `arr.includes(x)` | `x in arr` | membership (O(n) on a list!) |
| `"a" in obj` (keys) | `"a" in my_dict` | checks **keys** |

Chained comparisons are a Python treat: `if 0 <= i < len(xs):`

---

## 4 · Strings

Immutable, like JS. Common methods:
```python
s = "  Fire Bolt  "
s.strip()                 # "Fire Bolt"   (trim); .strip(".,!?") strips those chars
s.lower(); s.upper()      # case
s.replace("Fire", "Ice")  # "  Ice Bolt  "
s.split()                 # ['Fire', 'Bolt']  (splits on any whitespace run)
"a,b,c".split(",")        # ['a', 'b', 'c']
"-".join(["a", "b"])      # "a-b"   <-- join is a STRING method, not a list method
s.startswith("  F"); s.endswith("t ")
"cat" in "concatenate"    # True (substring test)
len(s)                    # length
```

**Slicing** `s[start:stop:step]` — `stop` is exclusive, negatives count from the end:
```python
s = "interview"
s[0]        # 'i'      (index)
s[-1]       # 'w'      (last)
s[-4:]      # 'view'   (last 4)
s[:3]       # 'int'    (first 3)
s[::2]      # 'itriw'  (every 2nd)
s[::-1]     # 'weivretni'  (reverse — the idiom)
```
Slicing works identically on lists.

---

## 5 · Lists — your `Array`

| JavaScript Array | Python list |
|---|---|
| `[1, 2, 3]` | `[1, 2, 3]` |
| `arr.push(x)` | `arr.append(x)` |
| `arr.push(a, b)` / `arr.concat(b)` | `arr.extend([a, b])` |
| `arr.pop()` | `arr.pop()` (end); `arr.pop(0)` (front) |
| `arr.shift()` | `arr.pop(0)` |
| `arr.unshift(x)` | `arr.insert(0, x)` |
| `arr.length` | `len(arr)` |
| `arr.includes(x)` | `x in arr` |
| `arr.indexOf(x)` | `arr.index(x)` (raises if absent!) |
| `arr.slice(1, 3)` | `arr[1:3]` |
| `arr.reverse()` (in place) | `arr.reverse()`; or `arr[::-1]` (new list) |
| `[...a, ...b]` | `a + b`  or  `[*a, *b]` |
| `arr.map/filter/reduce` | **comprehensions** (§8) — more idiomatic |

```python
nums = [3, 1, 2]
nums.sort()                 # in place -> [1, 2, 3], returns None (!)
new = sorted(nums)          # returns a NEW sorted list (use on any iterable)
nums.sort(reverse=True)     # descending
b = a               # ALIAS — both names, one list (mutating b changes a)
b = a.copy()        # shallow copy (independent outer list)
```
⚠️ `nums.sort()` returns `None`. Assigning `x = nums.sort()` gives you `None` — a
classic bug. Use `sorted(...)` when you want a value back.

---

## 6 · Dicts — your object / `Map`

Python `dict` is closest to a JS `Map`: **any hashable key**, insertion-ordered
(guaranteed since 3.7), O(1) lookup.

| JavaScript | Python |
|---|---|
| `{ a: 1 }` (string keys) | `{"a": 1}` (keys are real values — quote strings) |
| `obj.a` / `obj["a"]` | `d["a"]` (only bracket form; `.` is for methods) |
| `obj.a = 2` | `d["a"] = 2` |
| `obj.a ?? default` | `d.get("a", default)` (never raises) |
| `"a" in obj` | `"a" in d` (checks keys) |
| `delete obj.a` | `del d["a"]` or `d.pop("a", None)` |
| `Object.keys/values/entries` | `d.keys()` / `d.values()` / `d.items()` |
| `{...a, ...b}` | `{**a, **b}` or `a \| b` (3.9+) |
| `new Map()` | `{}` handles it |

```python
d = {"sword": 2}
d["shield"] = 1
d["sword"]              # 2
d["missing"]           # KeyError!  <-- raises
d.get("missing")       # None       (safe)
d.get("missing", 0)    # 0          (default)

for key in d:                 # iterates KEYS
    ...
for key, val in d.items():    # iterates pairs — the common one
    print(key, val)

# Count / accumulate idiom (no [k]++ — the key may not exist yet):
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1   # the safe increment
```

---

## 7 · Sets & tuples

**`set`** — like JS `Set`, O(1) membership + algebra. **But NOT insertion-ordered.**
```python
s = {1, 2, 3}          # literal (note: {} is an empty DICT, use set() for empty set)
s.add(4); s.discard(2)
3 in s                 # O(1) membership — the whole point
a | b   a & b   a - b  # union, intersection, difference
list(set(xs))          # dedupe BUT loses order; for ordered: list(dict.fromkeys(xs))
```

**`tuple`** — a frozen list. Immutable → **hashable** → usable as a dict key / set member.
```python
point = (lat, lon)     # a "record" / row
x, y = point           # unpack
single = (x,)          # 1-tuple needs the trailing comma!
cache[(user_id, page)] = result   # tuple as composite dict key
```

---

## 8 · Comprehensions — your `map` / `filter`, idiomatic

This is the Python you'll write most. Read them left-to-right as loops.

| JavaScript | Python |
|---|---|
| `arr.map(x => x * 2)` | `[x * 2 for x in arr]` |
| `arr.filter(x => x > 0)` | `[x for x in arr if x > 0]` |
| `arr.filter(...).map(...)` | `[f(x) for x in arr if cond(x)]` (one pass) |
| `arr.map(x => x>0 ? x : 0)` | `[x if x > 0 else 0 for x in arr]` (transform each) |

```python
squares   = [x*x for x in range(5)]                # [0, 1, 4, 9, 16]
evens     = [x for x in range(10) if x % 2 == 0]   # filter
pairs     = [(x, y) for x in range(3) for y in range(2)]  # nested loops
by_id     = {u["id"]: u for u in users}            # DICT comprehension
uniq      = {x for x in xs}                         # SET comprehension
gen       = (x*x for x in xs)                        # generator (lazy, no [])
```
**Position matters:** `if` *after* the `for` = filter; `A if c else B` *before*
the `for` = per-element transform (every element produces a value).

---

## 9 · Control flow

```python
# if / elif / else  (note: elif, not "else if")
if x > 0:
    ...
elif x == 0:
    ...
else:
    ...

# for is a for-OF loop — it iterates values, not indices
for item in items:
    ...
for i in range(5):            # 0,1,2,3,4  — range(start, stop, step), stop exclusive
    ...
for i, item in enumerate(items):        # index + value (like entries())
    ...
for i, item in enumerate(items, start=1):   # 1-based
    ...
for a, b in zip(list_a, list_b):        # walk two lists together (stops at shortest!)
    ...

while condition:
    ...
    if done: break
    if skip: continue

# there is no C-style for(;;) and no do-while
```

---

## 10 · Functions

| JavaScript | Python |
|---|---|
| `function f(a, b) {}` | `def f(a, b):` |
| `const f = (a) => a * 2` | `f = lambda a: a * 2` (small only) or `def` |
| `function f(a = 1)` | `def f(a=1):` |
| `function f(...rest)` | `def f(*args):` (tuple of extras) |
| `f(...arr)` | `f(*arr)` (spread into positional) |
| named opts `f({x, y})` | `def f(**kwargs):` / `f(x=1, y=2)` |
| `return;` (undefined) | `return` or nothing → returns `None` |

```python
def top_words(text, n, *, reverse=False):   # '*' = everything after is keyword-only
    ...
    return result

def scale(x, factor=2):      # default arg
    return x * factor

scale(10)          # 20
scale(10, 3)       # 30
scale(10, factor=3)  # keyword arg, order-free
```
⚠️ **Never use a mutable default** (`def f(x, acc=[])`). It's created once and
shared across calls — a top interview gotcha. Use `acc=None` then
`if acc is None: acc = []`.

**Sorting with a key** (fingers should know this cold):
```python
sorted(words, key=len)                       # by length
sorted(items, key=lambda p: (-p[1], p[0]))   # count DESC, then name ASC
```

---

## 11 · The built-ins you'll reach for constantly

```python
len(x)                    # length of any collection/string
range(stop) / range(a,b,step)   # lazy integer sequence
enumerate(xs), zip(a, b)  # index+value / parallel walk
sorted(xs, key=..., reverse=...)   # new sorted list
reversed(xs)              # reverse iterator
sum(xs)  min(xs)  max(xs) # aggregation; min/max take key= too
any(xs)  all(xs)          # short-circuit boolean over an iterable
map(f, xs)  filter(f, xs) # exist, but comprehensions read better
abs(n)  round(n, 2)       # math
int(x)  float(x)  str(x)  bool(x)  list(x)  dict(x)  set(x)  tuple(x)   # conversions
type(x)  isinstance(x, T) # type checks
```

---

## 12 · Errors — try / except

| JavaScript | Python |
|---|---|
| `try { } catch (e) { }` | `try:` / `except SomeError as e:` |
| `throw new Error("x")` | `raise ValueError("x")` |
| `finally { }` | `finally:` |
| (no equivalent) | `else:` — runs if NO exception |

```python
try:
    val = d["key"]
except KeyError:
    val = default
except (TypeError, ValueError) as e:   # catch several
    print(f"bad input: {e}")
else:
    print("no error happened")
finally:
    print("always runs")

raise ValueError("must be positive")   # throw
```
Catch **specific** exceptions, not bare `except:`. Common ones: `KeyError`,
`IndexError`, `ValueError`, `TypeError`, `ZeroDivisionError`, `FileNotFoundError`.

---

## 13 · Classes (the short version)

```python
class Spell:
    def __init__(self, name, level):   # constructor (like JS constructor)
        self.name = name               # 'self' is explicit (JS 'this', but a real param)
        self.level = level

    def cast(self):                    # method — 'self' is always first
        return f"{self.name} (lvl {self.level})"

    def __repr__(self):                # like toString() for debugging
        return f"Spell({self.name!r}, {self.level})"

fireball = Spell("Fireball", 3)        # no 'new' keyword
print(fireball.cast())
```
Interview shortcut for plain data: `@dataclass` (covered in L4) auto-writes
`__init__`/`__repr__`/`__eq__` for you.

---

## 14 · Imports & modules

```python
import math                      # math.sqrt(9)
from collections import Counter  # then use Counter(...) directly
from typing import Optional
import numpy as np               # aliased import

# Standard-library heroes for these lessons:
from collections import Counter, defaultdict, deque
Counter(words)                   # {word: count} in one call
defaultdict(list)                # dict where missing keys default to []
deque()                          # O(1) append/pop at BOTH ends (real queue)

if __name__ == "__main__":       # "run this only when executed directly"
    main()
```

---

## 15 · Gotchas that specifically bite a JS dev

1. **`{}` is an empty *dict*, not a set.** Empty set is `set()`.
2. **`b = a` aliases** (same as JS objects); it never copies. `.copy()` for a shallow copy.
3. **No `++`/`--`.** Use `+= 1`.
4. **`is` vs `==`.** `==` for values; `is` only for `None`/singletons.
5. **`list.sort()` returns `None`** (mutates in place). Want a value? `sorted()`.
6. **Integer division is `//`.** `7 / 2 == 3.5`; `7 // 2 == 3`.
7. **`x in a_list` is O(n).** Inside a loop that's O(n·m) — pre-build a `set`.
8. **`sets` and `dict.fromkeys`:** `list(set(xs))` drops order; use
   `list(dict.fromkeys(xs))` to dedupe *and* keep first-seen order.
9. **Mutable default args** are evaluated once → shared state. Use `None` sentinel.
10. **Truthiness of empty collections:** `if not items:` means "is it empty".
11. **`zip` stops at the shortest list** silently — a data-loss trap.
12. **Indentation errors are syntax errors.** Mixing tabs/spaces breaks things; use 4 spaces.

---

*This scroll grows as you do. When a new idiom bites you in a quest, tell the Game
Master and we'll carve it in. Now go forge `word_hoard.py` — the reference is for
looking up syntax, not for copying answers. The Trial accepts only your own runes.*
