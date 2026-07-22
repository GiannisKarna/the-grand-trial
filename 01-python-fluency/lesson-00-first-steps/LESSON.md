# L0 · First Steps — Before the Runes

*Region: The Rune Plains (the eastern gate) · Priority: P0 · Quests: 0 (warm-up only) · No boss*

> *Before the standing stones, before the Keeper, there is a dirt path and a
> campfire. Every mage who ever crossed the Plains sat here first and learned to
> hold a stylus. You have held one for four years — but in another tongue. This
> is where we teach your hand the new script, slowly, with nobody watching the
> clock.*

---

## Who this is for (read this first)

You are **not** a beginner at programming. You have ~4 years of JavaScript — you
know what a variable is, what a loop does, why a function returns. **Keep that.**
It is 80% of the battle and it transfers almost completely.

What you are a beginner at is **Python the language**: its spelling, its idioms,
and the handful of places where it genuinely thinks differently from JS. So L0
is not "what is a variable". It is *"here is how the thing you already know is
written and run in Python, and here are the 4–5 spots that will trip a JS dev."*

By the end of L0 you can, from a blank file: write basic Python, **run it**, and
read an error message without your stomach dropping. That's the whole goal. The
runes (data structures) start in L1 — this is the campfire.

> 🧙 **Two companions for the whole region:**
> - **[The JS→Python Bridge Scroll](../PYTHON-CHEATSHEET.md)** — a lookup table
>   (JS on the left, Python on the right). L0 *teaches*; the scroll is where you
>   *glance* while writing. Section numbers below point into it.
> - **The «Ρώτα τον Δάσκαλο» button** in the quiz boss — press it any time for a
>   deep, teacher-to-student explanation **in Greek** of a question and its
>   answer. Use it whenever "the right answer" isn't the same as "I get why."

---

## 1 · The one mental shift

Read this Python out loud. You already know what it does — that's the point.

```python
def greet(name):
    if name:
        print(f"Hello, {name}!")
    else:
        print("Hello, stranger.")

greet("Dimitris")
greet("")
```

Here is the *same program* in the JavaScript you'd write in your sleep:

```javascript
function greet(name) {
  if (name) {
    console.log(`Hello, ${name}!`);
  } else {
    console.log("Hello, stranger.");
  }
}
```

Line them up and the differences are almost all **cosmetic**:

| JavaScript | Python | What changed |
|---|---|---|
| `function greet(name) {` | `def greet(name):` | `def`, and a colon `:` instead of `{` |
| `{ ... }` braces | **indentation** | 4 spaces *is* the block. No braces, ever. |
| `console.log(x)` | `print(x)` | different name |
| `` `Hello, ${name}!` `` | `f"Hello, {name}!"` | `f"..."` instead of backticks; no `$` |
| `;` at line ends | nothing | Python doesn't use semicolons |

**The single biggest adjustment:** in Python, **whitespace is syntax.** A colon
`:` opens a block, and the *indentation* underneath it is the block — there are
no `{ }` to close. Line things up with **4 spaces** and stay consistent. Get the
indentation wrong and Python refuses to run (it's a syntax error, not a warning).

That's it. That's the shift. Everything else is vocabulary, and the
[Bridge Scroll](../PYTHON-CHEATSHEET.md) is the dictionary.

---

## 2 · Run your first spell

Reading Python is easy. The muscle you're actually here to build is *writing it
from blank and running it*. So let's run something on the first page.

1. Make a scratch file — anywhere is fine, e.g. `lesson-00-first-steps/sandbox/hello.py`:

```python
print("The Trial begins.")
name = "Dimitris"
print(f"Welcome, {name}.")
```

2. Run it. This repo has its own Python inside `.venv`. From the repo root:

```bash
# macOS / Linux (you're on macOS):
.venv/bin/python 01-python-fluency/lesson-00-first-steps/sandbox/hello.py

# Windows would be:  .venv\Scripts\python.exe <same path>
```

You should see:

```text
The Trial begins.
Welcome, Dimitris.
```

> 🌉 **From JS:** this is `node hello.js`. Same idea — a runtime executes a file
> top to bottom. The only new part is pointing at the project's `.venv` Python
> instead of a global `node`, so every lesson uses the exact same interpreter
> and packages.

There's also an interactive mode (a REPL, like the browser console): run
`.venv/bin/python` with no file and you get a `>>>` prompt where each line runs
as you type. Great for poking at a single expression. Press `Ctrl-D` (or type
`exit()`) to leave.

---

## 3 · Variables — labels, not boxes

In Python you **just assign**. No `let`, no `const`, no `var`, no type keyword:

```python
level = 5           # JS: let level = 5
name = "Dimitris"   # JS: let name = "Dimitris"
level = "five"      # totally legal — the name can point at any type
```

Two things a JS dev should notice:

1. **There is no `const`.** The convention is: a name in `ALL_CAPS` means "treat
   this as constant, don't reassign it" — but nothing *stops* you. It's an honor
   system, like the Trial itself.
2. **A variable is a label you stick on a value, not a box you pour a value
   into.** `level = 5` means "the name `level` now points at the object `5`".
   This sounds like philosophy, but it is the root of the single most common
   Python bug for newcomers — and you'll meet it head-on in L1:

```python
a = [1, 2, 3]
b = a          # b is a SECOND label on the SAME list — not a copy
b.append(4)
print(a)       # [1, 2, 3, 4]   <-- a changed too!
```

> 🌉 **From JS:** identical to `const b = a` when `a` is an array/object — both
> names reference the same thing. You already have this reflex from JS; Python
> just makes it feel more surprising because the syntax `b = a` looks so much
> like a copy. It never is. (To actually copy: `b = a.copy()`.)

---

## 4 · The values you'll hold constantly

Everything in Python is an **object**, and `type(x)` tells you what kind:

```python
type(7)          # <class 'int'>      whole number
type(3.14)       # <class 'float'>    decimal
type("rune")     # <class 'str'>      text (immutable, like JS strings)
type(True)       # <class 'bool'>     True / False  (capitalized!)
type(None)       # <class 'NoneType'> "nothing" — JS null AND undefined in one
type([1, 2])     # <class 'list'>     your Array
type({"a": 1})   # <class 'dict'>     your object / Map
```

The JS-dev trip-wires here (all in Bridge Scroll §2):

- **`True` / `False` / `None` are capitalized.** Lowercase `true` is a
  `NameError`.
- **`None` is the only "nothing".** JS has `null` *and* `undefined`; Python has
  one word for both.
- **Numbers split into `int` and `float`.** `7` and `7.0` are different types.
  Careful: `7 / 2` is `3.5` (always a float), while `7 // 2` is `3` (floor
  division — a new operator for you).

```python
7 / 2      # 3.5   normal division ALWAYS gives a float
7 // 2     # 3     floor division (JS: Math.floor(7/2))
7 % 2      # 1     remainder
2 ** 10    # 1024  exponent (JS: 2 ** 10 as well, or Math.pow)
```

---

## 5 · Talking: `print` and f-strings

`print` is `console.log`. f-strings are your template literals — same idea,
better ergonomics:

```python
name, hp = "Dimitris", 42
print(name, hp)              # Dimitris 42   (print space-joins its arguments)
print(f"{name} has {hp} HP") # Dimitris has 42 HP
print(f"{hp * 2} at rest")   # 84 at rest    (expressions run inside the braces)
print(f"{name=}")            # name='Dimitris'  (the '=' debug form — handy)
```

The leading `f` is what turns on the `{ }` substitution. Forget it and you print
the braces literally: `print("{name}")` → `{name}`.

---

## 6 · Deciding and repeating

### if / elif / else

```python
score = 72
if score >= 90:
    print("A")
elif score >= 60:        # 'elif', not 'else if'
    print("pass")
else:
    print("retry")
```

`elif` is the only odd spelling. Conditions use **words**: `and`, `or`, `not`
(not `&&`, `||`, `!`). See Bridge Scroll §3.

### for — it's a `for...of`, always

Python's `for` iterates **values**, never indices. It's the JS `for...of`:

```python
spells = ["fire", "ice", "wind"]
for spell in spells:
    print(spell)

for i in range(3):        # 0, 1, 2   -- range(stop) is exclusive of stop
    print(i)

for i, spell in enumerate(spells):   # index + value together (JS: .entries())
    print(i, spell)
```

> 🌉 **From JS:** there is no `for (let i = 0; i < n; i++)`. When you truly need
> the index, you reach for `range(len(...))` or, better, `enumerate(...)`. When
> you just need the items, loop the list directly.

### while

```python
hp = 3
while hp > 0:
    print("still standing")
    hp -= 1          # no hp-- ; Python has no ++/-- (Bridge Scroll §3, §15)
```

---

## 7 · When it breaks: reading a traceback

You will cause errors constantly — that is *normal and correct*. The skill is
reading them calmly. Run this on purpose:

```python
scores = {"sword": 2}
print(scores["shield"])
```

Python prints a **traceback**:

```text
Traceback (most recent call last):
  File "hello.py", line 2, in <module>
    print(scores["shield"])
          ~~~~~~^^^^^^^^^^
KeyError: 'shield'
```

How to read it, every time:

1. **Read the LAST line first.** It's the *type* and *message*:
   `KeyError: 'shield'` → "you asked a dict for a key it doesn't have."
2. **Then the line above the arrow** tells you *where*: file and line number,
   with `^^^` pointing at the exact spot.
3. Everything in the middle is the call chain (which function called which). For
   a short script it's just `<module>` = "the top level of your file".

A few you'll meet in week one, and what each really means:

| Error | Plain meaning |
|---|---|
| `NameError` | you used a name that doesn't exist (typo? or `true` instead of `True`) |
| `TypeError` | you did an operation on the wrong type (`"3" + 5`) |
| `KeyError` | a dict has no such key — use `d.get(key)` when it's optional |
| `IndexError` | a list index is out of range |
| `IndentationError` | your whitespace/indentation doesn't line up |
| `ValueError` | right type, wrong value (`int("hello")`) |

> 🧙 Stuck on *why* an error happens? That's exactly what the **Ρώτα τον
> Δάσκαλο** button is for — it'll walk you through it in Greek, from your JS
> intuition.

---

## 8 · Warm-up rite (run it yourself — no grading)

No boss, no tests, no XP here — just prove the tools work in your hands. In your
`sandbox/`, write a file that produces **exactly** this output:

```text
Party roll call:
1. Dimitris the Brave — 42 HP
2. Aria the Swift — 30 HP
3. Bran the Wise — 25 HP
Total party HP: 97
```

Constraints (so it's practice, not a puzzle):

- Keep the party as a **list of tuples**, e.g. `("Dimitris the Brave", 42)`.
- Print the roster with a `for` loop + `enumerate(..., start=1)` + an f-string.
- Compute the total with the built-in `sum(...)` over the HP values (a
  comprehension `[hp for name, hp in party]` is the idiomatic way — you'll live
  in these by L1).

If it runs and matches, L0 is done. Don't summon the Game Master to grade it —
grading starts at L1's quests. Summon them only if you're stuck, and the hint
ladder applies: *nudge → pointer → pseudocode → never the answer.*

---

## 9 · Interview angle (yes, already)

Even the campfire connects to the interview:

- **Running code and reading errors calmly is a signal.** Interviewers watch how
  you react to a red traceback. Panicking reads as junior; reading the last line
  out loud and fixing it reads as senior. Practice the calm now.
- **Think out loud.** From day one, narrate what you're doing ("I'll keep the
  party as tuples so name and HP travel together"). Conceptual interviews are
  verbal; the habit starts here.
- **You'll be asked to write Python from blank, while talking, under a clock.**
  L0 removes the "how do I even run this" friction so that by L5's Time Trials,
  the only thing under load is your *thinking*, not your *typing*.

---

## 10 · What's next

You can read, write, and run basic Python, and you can read an error. That's the
on-ramp done. Now the runes begin.

- **Keep the [Bridge Scroll](../PYTHON-CHEATSHEET.md) open** while you work —
  glance, don't memorize.
- **Next:** [L1 · Runes of Data](../lesson-01-runes-of-data/LESSON.md) — the four
  core containers (list/dict/set/tuple) and the mutability traps that the `b = a`
  moment above just previewed. Start with its new **Section 0 · In plain words**,
  then go as deep as you like.

---

**Status:** L0 has no boss — it's complete when the warm-up rite runs on your
machine. *Next: open `../lesson-01-runes-of-data/LESSON.md`.*
