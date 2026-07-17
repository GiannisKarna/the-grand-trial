"""Tests for Quest 1 · The Word-Hoard.

You write word_hoard.py in this folder, from a blank file.
Run:  .venv\\Scripts\\python.exe -m pytest 01-python-fluency\\lesson-01-runes-of-data\\quest-01\\workspace -q
Read these tests as the precise spec — every rule in brief.md is pinned here.
"""

from word_hoard import (
    group_by_first_letter,
    tally_words,
    top_words,
    unique_in_order,
)


# ---------------------------------------------------------------- tally_words

class TestTallyWords:
    def test_basic_counts(self):
        assert tally_words("the cat and the hat") == {
            "the": 2, "cat": 1, "and": 1, "hat": 1,
        }

    def test_returns_a_dict(self):
        assert isinstance(tally_words("one word"), dict)

    def test_lowercases_everything(self):
        assert tally_words("The THE the tHe") == {"the": 4}

    def test_strips_edge_punctuation(self):
        assert tally_words("Stop! Stop, stop.") == {"stop": 3}

    def test_strips_multiple_punctuation_marks(self):
        assert tally_words("really?! yes... really:;") == {"really": 2, "yes": 1}

    def test_inner_punctuation_is_kept(self):
        assert tally_words("don't stop, don't") == {"don't": 2, "stop": 1}

    def test_hyphens_are_kept(self):
        assert tally_words("co-op co-op") == {"co-op": 2}

    def test_punctuation_only_tokens_are_dropped(self):
        assert tally_words("wait ... what ?") == {"wait": 1, "what": 1}

    def test_empty_text(self):
        assert tally_words("") == {}

    def test_whitespace_only_text(self):
        assert tally_words("   \t  \n ") == {}

    def test_splits_on_any_whitespace(self):
        assert tally_words("a\tb\nc  a") == {"a": 2, "b": 1, "c": 1}


# ------------------------------------------------------------------ top_words

class TestTopWords:
    TEXT = "wand wand wand shield shield sword sword arrow"

    def test_orders_by_count_descending(self):
        assert top_words(self.TEXT, 2) == [("wand", 3), ("shield", 2)]

    def test_ties_break_alphabetically(self):
        # shield and sword both have count 2 -> shield first
        assert top_words(self.TEXT, 4) == [
            ("wand", 3), ("shield", 2), ("sword", 2), ("arrow", 1),
        ]

    def test_returns_list_of_tuples(self):
        result = top_words(self.TEXT, 2)
        assert isinstance(result, list)
        assert all(isinstance(pair, tuple) for pair in result)

    def test_n_larger_than_vocabulary_returns_everything(self):
        assert top_words("a b a", 99) == [("a", 2), ("b", 1)]

    def test_n_zero(self):
        assert top_words(self.TEXT, 0) == []

    def test_empty_text(self):
        assert top_words("", 5) == []

    def test_uses_same_tokenization_as_tally(self):
        assert top_words("Go! go stop.", 1) == [("go", 2)]

    def test_all_tied_counts_come_back_alphabetical(self):
        assert top_words("c b a", 3) == [("a", 1), ("b", 1), ("c", 1)]


# ------------------------------------------------------------ unique_in_order

class TestUniqueInOrder:
    def test_keeps_first_occurrence_order(self):
        assert unique_in_order([3, 1, 3, 2, 1]) == [3, 1, 2]

    def test_strings(self):
        assert unique_in_order(["b", "a", "b", "c", "a"]) == ["b", "a", "c"]

    def test_no_duplicates_is_identity(self):
        assert unique_in_order([1, 2, 3]) == [1, 2, 3]

    def test_all_duplicates(self):
        assert unique_in_order(["x", "x", "x"]) == ["x"]

    def test_empty(self):
        assert unique_in_order([]) == []

    def test_does_not_sort(self):
        assert unique_in_order([9, 1, 5]) == [9, 1, 5]

    def test_does_not_mutate_input(self):
        items = [1, 1, 2]
        unique_in_order(items)
        assert items == [1, 1, 2]

    def test_case_sensitive_values(self):
        # 'A' and 'a' are different values — no folding here
        assert unique_in_order(["A", "a", "A"]) == ["A", "a"]


# ---------------------------------------------------- group_by_first_letter

class TestGroupByFirstLetter:
    def test_groups_and_sorts(self):
        assert group_by_first_letter(["ash", "oak", "apple", "elm"]) == {
            "a": ["apple", "ash"],
            "o": ["oak"],
            "e": ["elm"],
        }

    def test_key_is_lowercased_but_words_keep_casing(self):
        assert group_by_first_letter(["Fire", "frost"]) == {
            "f": ["Fire", "frost"],  # plain sorted(): 'F' < 'f'
        }

    def test_single_word(self):
        assert group_by_first_letter(["rune"]) == {"r": ["rune"]}

    def test_empty(self):
        assert group_by_first_letter([]) == {}

    def test_values_are_sorted_within_group(self):
        result = group_by_first_letter(["dawn", "dusk", "dark"])
        assert result == {"d": ["dark", "dawn", "dusk"]}

    def test_does_not_mutate_input(self):
        words = ["zeta", "alpha"]
        group_by_first_letter(words)
        assert words == ["zeta", "alpha"]
