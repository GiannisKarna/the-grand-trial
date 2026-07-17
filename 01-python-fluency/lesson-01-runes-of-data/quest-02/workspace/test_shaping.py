"""Tests for Quest 2 · The Shaping of Collections.

You write shaping.py in this folder, from a blank file. No imports needed there.
Run:  .venv\\Scripts\\python.exe -m pytest 01-python-fluency\\lesson-01-runes-of-data\\quest-02\\workspace -q
Read these tests as the precise spec.
"""

import copy

import pytest

from shaping import (
    filter_by_school,
    invert_index,
    names_by_level,
    strongest_per_school,
    total_components,
)

SPELLS = [
    {"name": "Fireball", "school": "evocation", "level": 3,
     "components": ["bat guano", "sulfur"]},
    {"name": "Lightning Bolt", "school": "evocation", "level": 3,
     "components": ["fur", "amber rod"]},
    {"name": "Ice Knife", "school": "conjuration", "level": 1,
     "components": ["water"]},
    {"name": "Grease", "school": "conjuration", "level": 1,
     "components": ["butter"]},
    {"name": "Shield", "school": "abjuration", "level": 1,
     "components": []},
    {"name": "Stoneskin", "school": "abjuration", "level": 4,
     "components": ["diamond dust"]},
    {"name": "Glyph of Warding", "school": "abjuration", "level": 3,
     "components": ["diamond dust", "incense"]},
]


@pytest.fixture
def spells():
    """A fresh deep copy per test, so mutation in one test can't hide in another."""
    return copy.deepcopy(SPELLS)


# ----------------------------------------------------------- filter_by_school

class TestFilterBySchool:
    def test_returns_matching_spell_dicts_in_order(self, spells):
        result = filter_by_school(spells, "evocation")
        assert [s["name"] for s in result] == ["Fireball", "Lightning Bolt"]
        assert result[0]["level"] == 3

    def test_returns_the_dicts_not_just_names(self, spells):
        result = filter_by_school(spells, "conjuration")
        assert all(isinstance(s, dict) for s in result)
        assert result == [spells[2], spells[3]]

    def test_unknown_school_is_empty_list(self, spells):
        assert filter_by_school(spells, "necromancy") == []

    def test_empty_input(self):
        assert filter_by_school([], "evocation") == []

    def test_exact_match_only(self, spells):
        assert filter_by_school(spells, "Evocation") == []  # case matters


# ------------------------------------------------------------ names_by_level

class TestNamesByLevel:
    def test_groups_and_sorts_names(self, spells):
        assert names_by_level(spells) == {
            1: ["Grease", "Ice Knife", "Shield"],
            3: ["Fireball", "Glyph of Warding", "Lightning Bolt"],
            4: ["Stoneskin"],
        }

    def test_only_present_levels_appear(self, spells):
        assert set(names_by_level(spells)) == {1, 3, 4}

    def test_empty_input(self):
        assert names_by_level([]) == {}

    def test_single_spell(self):
        one = [{"name": "Zap", "school": "evocation", "level": 0, "components": []}]
        assert names_by_level(one) == {0: ["Zap"]}


# --------------------------------------------------------- total_components

class TestTotalComponents:
    def test_union_of_all_components(self, spells):
        assert total_components(spells) == {
            "bat guano", "sulfur", "fur", "amber rod", "water",
            "butter", "diamond dust", "incense",
        }

    def test_returns_a_set(self, spells):
        assert isinstance(total_components(spells), set)

    def test_shared_components_counted_once(self, spells):
        # "diamond dust" is used by two spells but appears once in a set
        result = total_components(spells)
        assert len(result) == 8

    def test_componentless_spells_contribute_nothing(self):
        bare = [{"name": "Shield", "school": "abjuration", "level": 1,
                 "components": []}]
        assert total_components(bare) == set()

    def test_empty_input(self):
        assert total_components([]) == set()


# -------------------------------------------------------------- invert_index

class TestInvertIndex:
    def test_component_maps_to_sorted_spell_names(self, spells):
        index = invert_index(spells)
        assert index["diamond dust"] == ["Glyph of Warding", "Stoneskin"]
        assert index["water"] == ["Ice Knife"]

    def test_full_index(self, spells):
        assert invert_index(spells) == {
            "bat guano": ["Fireball"],
            "sulfur": ["Fireball"],
            "fur": ["Lightning Bolt"],
            "amber rod": ["Lightning Bolt"],
            "water": ["Ice Knife"],
            "butter": ["Grease"],
            "diamond dust": ["Glyph of Warding", "Stoneskin"],
            "incense": ["Glyph of Warding"],
        }

    def test_empty_input(self):
        assert invert_index([]) == {}


# ------------------------------------------------------- strongest_per_school

class TestStrongestPerSchool:
    def test_highest_level_wins(self, spells):
        assert strongest_per_school(spells)["abjuration"] == "Stoneskin"

    def test_level_tie_breaks_to_alphabetically_first_name(self, spells):
        result = strongest_per_school(spells)
        assert result["evocation"] == "Fireball"      # ties Lightning Bolt at 3
        assert result["conjuration"] == "Grease"      # ties Ice Knife at 1

    def test_all_schools_present(self, spells):
        assert set(strongest_per_school(spells)) == {
            "evocation", "conjuration", "abjuration",
        }

    def test_empty_input(self):
        assert strongest_per_school([]) == {}


# ------------------------------------------------------------- no mutation

class TestNothingMutatesTheInput:
    def test_all_functions_leave_spells_untouched(self, spells):
        before = copy.deepcopy(spells)
        filter_by_school(spells, "evocation")
        names_by_level(spells)
        total_components(spells)
        invert_index(spells)
        strongest_per_school(spells)
        assert spells == before
