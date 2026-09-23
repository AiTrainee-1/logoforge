"""Filename helpers: sanitising, branded output names, alphabetic labels."""
from __future__ import annotations

import os
import re
import unicodedata

BRANDED_SUFFIX = "_branded"
_UNSAFE = re.compile(r"[^A-Za-z0-9._ -]+")
_SPACES = re.compile(r"\s+")

_RESERVED = {"CON", "PRN", "AUX", "NUL"}
_RESERVED |= {"COM%d" % i for i in range(1, 10)}
_RESERVED |= {"LPT%d" % i for i in range(1, 10)}


def sanitize_filename(name: str, fallback: str = "image") -> str:
    """Return a filesystem-safe *basename*.

    The client supplied name is never trusted: directory components, control
    characters and unicode tricks are stripped before it is used anywhere.
    """
    name = (name or "").replace("\\", "/")
    name = name.split("/")[-1]
    name = unicodedata.normalize("NFKD", name)
    name = "".join(ch for ch in name if ch.isprintable())
    name = _UNSAFE.sub("_", name)
    name = _SPACES.sub(" ", name).strip(" ._")
    if not name:
        name = fallback
    stem, ext = os.path.splitext(name)
    if stem.upper() in _RESERVED:
        stem = "_" + stem
    return (stem + ext)[:180] or fallback


def split_ext(name: str):
    stem, ext = os.path.splitext(name)
    return stem, ext.lower()


def branded_name(original: str, extension: str) -> str:
    """Build the output filename for a processed image.

    ``product-front.jpg`` becomes ``product-front_branded.jpg``. A name that
    already carries the suffix is not doubled up.
    """
    stem, _ = split_ext(sanitize_filename(original))
    if not stem.endswith(BRANDED_SUFFIX):
        stem = stem + BRANDED_SUFFIX
    if not extension.startswith("."):
        extension = "." + extension
    return stem + extension.lower()


def unique_name(name: str, taken: set) -> str:
    """Disambiguate ``name`` against names already used in the same ZIP."""
    if name not in taken:
        taken.add(name)
        return name
    stem, ext = split_ext(name)
    index = 2
    while "%s_%d%s" % (stem, index, ext) in taken:
        index += 1
    result = "%s_%d%s" % (stem, index, ext)
    taken.add(result)
    return result


def alphabetic_label(index: int) -> str:
    """Excel style column label: 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB."""
    if index < 0:
        raise ValueError("index must be >= 0")
    label = ""
    index += 1
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        label = chr(ord("A") + remainder) + label
    return label
