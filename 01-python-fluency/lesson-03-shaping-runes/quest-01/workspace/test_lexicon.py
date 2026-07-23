"""Tests for Quest 1 · The Runesmith's Lexicon.

You write lexicon.py in this folder, from a blank file.
Run:  .venv/bin/python -m pytest 01-python-fluency/lesson-03-shaping-runes/quest-01/workspace -q
Read these tests as the precise spec — every rule in brief.md is pinned here.
"""

from lexicon import normalize, slugify, initials, reverse_words


class TestNormalize:
    def test_collapses_and_lowercases(self):
        assert normalize("  Hello   World  ") == "hello world"

    def test_single_word(self):
        assert normalize("ONE") == "one"

    def test_tabs_and_newlines(self):
        assert normalize("a\tb\nc") == "a b c"

    def test_empty(self):
        assert normalize("") == ""


class TestSlugify:
    def test_basic(self):
        assert slugify("Fire Bolt") == "fire-bolt"

    def test_collapses_runs(self):
        assert slugify("  The  Great  Library ") == "the-great-library"

    def test_single(self):
        assert slugify("Solo") == "solo"

    def test_empty(self):
        assert slugify("") == ""


class TestInitials:
    def test_two_names(self):
        assert initials("ada lovelace") == "AL"

    def test_many_names(self):
        assert initials("grace brewster murray hopper") == "GBMH"

    def test_single(self):
        assert initials("solo") == "S"

    def test_empty(self):
        assert initials("") == ""


class TestReverseWords:
    def test_basic(self):
        assert reverse_words("the quick fox") == "fox quick the"

    def test_single(self):
        assert reverse_words("one") == "one"

    def test_collapses_spaces(self):
        assert reverse_words("  pad   words  ") == "words pad"

    def test_empty(self):
        assert reverse_words("") == ""
