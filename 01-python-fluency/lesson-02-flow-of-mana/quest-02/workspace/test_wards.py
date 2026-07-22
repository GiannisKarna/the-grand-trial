"""Tests for Quest 2 · The Warded Gate.

You write wards.py in this folder, from a blank file.
Run:  .venv/bin/python -m pytest 01-python-fluency/lesson-02-flow-of-mana/quest-02/workspace -q
Read these tests as the precise spec — every rule in brief.md is pinned here.
"""

import pytest

from wards import safe_divide, parse_ints, require_positive, Ward


# ----------------------------------------------------------------- safe_divide

class TestSafeDivide:
    def test_normal_division(self):
        assert safe_divide(6, 2) == 3.0

    def test_negative(self):
        assert safe_divide(-9, 3) == -3.0

    def test_divide_by_zero_returns_none(self):
        assert safe_divide(5, 0) is None


# ------------------------------------------------------------------ parse_ints

class TestParseInts:
    def test_skips_non_numeric(self):
        assert parse_ints(["1", "x", "3"]) == [1, 3]

    def test_keeps_order_and_negatives(self):
        assert parse_ints(["-2", "4", "oops", "0"]) == [-2, 4, 0]

    def test_floats_are_not_ints(self):
        assert parse_ints(["4.5", "5"]) == [5]

    def test_empty(self):
        assert parse_ints([]) == []

    def test_all_bad(self):
        assert parse_ints(["a", "b"]) == []


# ------------------------------------------------------------- require_positive

class TestRequirePositive:
    def test_returns_value_when_positive(self):
        assert require_positive(5) == 5

    def test_zero_raises(self):
        with pytest.raises(ValueError):
            require_positive(0)

    def test_negative_raises_with_message(self):
        with pytest.raises(ValueError, match="positive"):
            require_positive(-3)


# ------------------------------------------------------------------------ Ward

class TestWard:
    def test_logs_open_work_close(self):
        log = []
        with Ward(log):
            log.append("work")
        assert log == ["open", "work", "close"]

    def test_enter_returns_the_ward(self):
        log = []
        with Ward(log) as w:
            assert isinstance(w, Ward)

    def test_closes_even_on_exception(self):
        log = []
        with pytest.raises(ValueError):
            with Ward(log):
                raise ValueError("boom")
        assert log == ["open", "close"]

    def test_does_not_suppress_the_exception(self):
        log = []
        with pytest.raises(RuntimeError):
            with Ward(log):
                raise RuntimeError("x")
