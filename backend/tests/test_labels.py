"""Alphabetic labels and filename handling."""
from __future__ import annotations

import pytest

from utils.filenames import (
    alphabetic_label,
    branded_name,
    sanitize_filename,
    unique_name,
)


@pytest.mark.parametrize(
    "index,expected",
    [
        (0, "A"),
        (1, "B"),
        (2, "C"),
        (3, "D"),
        (25, "Z"),
        (26, "AA"),
        (27, "AB"),
        (51, "AZ"),
        (52, "BA"),
        (701, "ZZ"),
        (702, "AAA"),
    ],
)
def test_alphabetic_label(index, expected):
    assert alphabetic_label(index) == expected


def test_labels_are_unique_and_ordered():
    labels = [alphabetic_label(i) for i in range(200)]
    assert len(set(labels)) == 200
    assert labels[:4] == ["A", "B", "C", "D"]


def test_negative_index_rejected():
    with pytest.raises(ValueError):
        alphabetic_label(-1)


def test_branded_name_keeps_original_stem():
    assert branded_name("product-front.jpg", ".jpg") == "product-front_branded.jpg"
    assert branded_name("shot.png", ".png") == "shot_branded.png"


def test_branded_suffix_is_not_doubled():
    assert branded_name("product_branded.jpg", ".jpg") == "product_branded.jpg"


def test_branded_name_follows_output_format():
    assert branded_name("photo.heic", ".jpg") == "photo_branded.jpg"


def test_sanitize_filename_strips_paths_and_unsafe_characters():
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("C:\\Windows\\evil.jpg") == "evil.jpg"
    assert "/" not in sanitize_filename("a/b/c.png")
    assert sanitize_filename("") == "image"


def test_unique_name_disambiguates_collisions():
    taken = set()
    assert unique_name("a_branded.jpg", taken) == "a_branded.jpg"
    assert unique_name("a_branded.jpg", taken) == "a_branded_2.jpg"
    assert unique_name("a_branded.jpg", taken) == "a_branded_3.jpg"
