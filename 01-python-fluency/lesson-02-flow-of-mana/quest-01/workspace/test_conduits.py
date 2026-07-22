"""Tests for Quest 1 · The Mana Conduits.

You write conduits.py in this folder, from a blank file.
Run:  .venv/bin/python -m pytest 01-python-fluency/lesson-02-flow-of-mana/quest-01/workspace -q
Read these tests as the precise spec — every rule in brief.md is pinned here.
"""

from conduits import channel, enchant, scaled, make_counter


# -------------------------------------------------------------------- channel

class TestChannel:
    def test_sums_several(self):
        assert channel(1, 2, 3) == 6

    def test_sums_two(self):
        assert channel(10, 5) == 15

    def test_single(self):
        assert channel(7) == 7

    def test_no_args_is_zero(self):
        assert channel() == 0

    def test_floats(self):
        assert channel(1.5, 2.5) == 4.0


# -------------------------------------------------------------------- enchant

class TestEnchant:
    def test_name_plus_traits(self):
        assert enchant("Sword", glow=True, dmg=5) == {
            "name": "Sword", "glow": True, "dmg": 5,
        }

    def test_name_only(self):
        assert enchant("Bare") == {"name": "Bare"}

    def test_returns_a_dict(self):
        assert isinstance(enchant("X"), dict)

    def test_traits_preserved(self):
        assert enchant("Ring", element="fire") == {"name": "Ring", "element": "fire"}


# --------------------------------------------------------------------- scaled

class TestScaled:
    def test_default_factor_is_two(self):
        assert scaled([1, 2, 3]) == [2, 4, 6]

    def test_custom_factor(self):
        assert scaled([1, 2, 3], 10) == [10, 20, 30]

    def test_empty(self):
        assert scaled([]) == []

    def test_does_not_mutate_input(self):
        original = [1, 2, 3]
        scaled(original, 5)
        assert original == [1, 2, 3]

    def test_returns_a_new_list(self):
        original = [1, 2]
        assert scaled(original, 1) is not original


# --------------------------------------------------------------- make_counter

class TestMakeCounter:
    def test_counts_from_zero(self):
        c = make_counter()
        assert c() == 0
        assert c() == 1
        assert c() == 2

    def test_custom_start(self):
        d = make_counter(10)
        assert d() == 10
        assert d() == 11

    def test_counters_are_independent(self):
        a = make_counter()
        b = make_counter(100)
        assert a() == 0
        assert b() == 100
        assert a() == 1
        assert b() == 101
