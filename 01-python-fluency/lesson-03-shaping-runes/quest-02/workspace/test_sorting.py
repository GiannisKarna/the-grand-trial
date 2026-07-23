"""Tests for Quest 2 · The Sorting Stones.

You write sorting.py in this folder, from a blank file.
Run:  .venv/bin/python -m pytest 01-python-fluency/lesson-03-shaping-runes/quest-02/workspace -q
Read these tests as the precise spec — every rule in brief.md is pinned here.
"""

from sorting import by_length, top_scorers, sort_by_last, sort_by_vowels


class TestByLength:
    def test_len_then_alpha(self):
        assert by_length(["bb", "a", "ccc", "aa", "b"]) == ["a", "b", "aa", "bb", "ccc"]

    def test_empty(self):
        assert by_length([]) == []

    def test_does_not_mutate(self):
        original = ["bb", "a"]
        by_length(original)
        assert original == ["bb", "a"]


class TestTopScorers:
    def test_score_desc_name_asc(self):
        assert top_scorers([("ana", 5), ("bo", 7), ("cy", 5)], 2) == ["bo", "ana"]

    def test_zero(self):
        assert top_scorers([("ana", 5)], 0) == []

    def test_n_larger_than_list(self):
        assert top_scorers([("ana", 5), ("bo", 7)], 10) == ["bo", "ana"]


class TestSortByLast:
    def test_by_last_name(self):
        assert sort_by_last(["Ada Lovelace", "Grace Hopper", "Alan Turing"]) == [
            "Grace Hopper", "Ada Lovelace", "Alan Turing",
        ]

    def test_tie_on_last_uses_full(self):
        assert sort_by_last(["Bob Smith", "Ann Smith"]) == ["Ann Smith", "Bob Smith"]


class TestSortByVowels:
    def test_vowels_desc_then_alpha(self):
        assert sort_by_vowels(["sky", "area", "be", "ee"]) == ["area", "ee", "be", "sky"]

    def test_tie_uses_alpha(self):
        assert sort_by_vowels(["ba", "ab"]) == ["ab", "ba"]
