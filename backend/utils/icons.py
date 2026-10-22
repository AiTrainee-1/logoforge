"""Small monochrome icon assets for the Catalog Composer's detail markers.

Icons (`assets/icons/*.png`, derived from Lucide - see ``LICENSE`` in that
folder) are stored as alpha masks: a plain black stroke on a transparent
background, not a baked colour. That is what lets the same file be tinted to
match whatever text colour the user has configured for that element, exactly
like any monochrome UI icon - change the text colour and the icon follows,
automatically, with no second asset needed.
"""
from __future__ import annotations

import functools
import re
from pathlib import Path

from PIL import Image

ASSET_DIR = Path(__file__).resolve().parent.parent / "assets" / "icons"

# Recognised catalog field label (lowercase) -> icon file stem. Deliberately
# small and curated: an unmapped label (Origin, Source, Period, Condition,
# Provenance, ...) simply gets no icon rather than a mismatched generic one -
# consistent with "subtle and consistent", not "an icon for everything".
ICON_FOR_LABEL = {
    "dimensions": "dimensions",
    "dimension": "dimensions",
    "size": "dimensions",
    "weight": "weight",
    "material": "material",
    "materials": "material",
    "medium": "material",
}
PRICE_ICON = "price"

_LABEL_PATTERN = re.compile(
    r"^\s*(?:%s)\s*:" % "|".join(ICON_FOR_LABEL), re.IGNORECASE
)
_PRICE_PATTERN = re.compile(r"^\s*price\b\s*(?::|-|—)", re.IGNORECASE)


def icon_for_line(line: str) -> str | None:
    """Return the icon name a rendered line should be prefixed with, if any.

    Mirrors the label/price detection in
    ``frontend/src/utils/catalogParser.ts`` (``LABEL_PATTERN``/
    ``PRICE_PATTERN``) so a line that became its own Details/Price element
    because of that pattern gets the icon that pattern implies.
    """
    if _PRICE_PATTERN.match(line):
        return PRICE_ICON
    match = _LABEL_PATTERN.match(line)
    if match:
        word = line.strip().split(":", 1)[0].strip().lower()
        return ICON_FOR_LABEL.get(word)
    return None


@functools.lru_cache(maxsize=16)
def _load_mask(name: str) -> Image.Image | None:
    path = ASSET_DIR / (name + ".png")
    try:
        if not path.is_file():
            return None
        with Image.open(path) as img:
            img.load()
            return img.convert("RGBA")
    except OSError:  # pragma: no cover - defensive
        return None


def tinted_icon(
    name: str, size: int, color: tuple, opacity: float = 100.0
) -> "Image.Image | None":
    """A ``size``x``size`` icon tinted to ``color``, or None if unavailable."""
    mask = _load_mask(name)
    if mask is None:
        return None
    size = max(1, int(round(size)))
    resized = mask.resize((size, size), Image.Resampling.LANCZOS)
    alpha = resized.getchannel("A")
    if opacity < 100.0:
        factor = max(0.0, opacity) / 100.0
        alpha = alpha.point(lambda value, factor=factor: int(round(value * factor)))
    tinted = Image.new("RGBA", resized.size, tuple(color[:3]) + (255,))
    tinted.putalpha(alpha)
    return tinted
