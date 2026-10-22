"""Font resolution for rendered text.

A bundled font is used when present (``assets/fonts``), otherwise a common
system sans-serif, otherwise Pillow's built-in scalable default. The resolved
family name is reported to the frontend so the preview can match it.

Two independent families are supported:

``default``
    The original sans-serif face used everywhere this module has always been
    used - Studio's A/B/C labels, the Composer's free-floating text stamps,
    and any text element that doesn't ask for something else. Untouched.
``serif``
    An editorial serif bundled specifically for the Catalog Composer's
    auto-generated title/description/details/price sections. Nothing outside
    the Catalog Composer opts into this family, so nothing else changes.
"""
from __future__ import annotations

import functools
from pathlib import Path

from PIL import ImageFont

ASSET_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
DEFAULT_FAMILY = "default"

# Ordered by preference, per family and weight. The first readable file wins.
_CANDIDATES = {
    "default": {
        True: [  # bold
            ASSET_DIR / "Inter-Bold.ttf",
            ASSET_DIR / "DejaVuSans-Bold.ttf",
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("C:/Windows/Fonts/seguisb.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
            Path("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"),
            Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
            Path("/Library/Fonts/Arial Bold.ttf"),
        ],
        False: [  # regular
            ASSET_DIR / "Inter-Regular.ttf",
            ASSET_DIR / "DejaVuSans.ttf",
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/segoeui.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
            Path("/usr/share/fonts/TTF/DejaVuSans.ttf"),
            Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
            Path("/Library/Fonts/Arial.ttf"),
        ],
    },
    "serif": {
        # Crimson Text (OFL) - see assets/fonts/OFL.txt. SemiBold stands in
        # for "bold": the reference calls for a title that is "medium/
        # semibold rather than extremely bold", and Crimson Text ships a
        # real SemiBold weight rather than forcing a synthetic emboldening.
        True: [ASSET_DIR / "CrimsonText-SemiBold.ttf"],
        False: [ASSET_DIR / "CrimsonText-Regular.ttf"],
    },
}


def _candidates(bold: bool, family: str):
    return _CANDIDATES.get(family, _CANDIDATES[DEFAULT_FAMILY])[bold]


@functools.lru_cache(maxsize=8)
def font_path(bold: bool = True, family: str = DEFAULT_FAMILY):
    for candidate in _candidates(bold, family):
        try:
            if candidate.is_file():
                # Prove Pillow can actually load it before committing.
                ImageFont.truetype(str(candidate), 16)
                return candidate
        except (OSError, ValueError):
            continue
    return None


def load_font(size: int, bold: bool = True, family: str = DEFAULT_FAMILY) -> ImageFont.ImageFont:
    """Return a font object of roughly ``size`` pixels."""
    size = max(1, int(round(size)))
    path = font_path(bold, family)
    if path is not None:
        try:
            return ImageFont.truetype(str(path), size)
        except (OSError, ValueError):  # pragma: no cover - defensive
            pass
    try:
        # Pillow >= 10.1 ships a scalable default face.
        return ImageFont.load_default(size=size)
    except TypeError:  # pragma: no cover - very old Pillow
        return ImageFont.load_default()


def font_family_name(bold: bool = True, family: str = DEFAULT_FAMILY) -> str:
    path = font_path(bold, family)
    return path.stem if path is not None else "default"


@functools.lru_cache(maxsize=8)
def font_charset(path_str: str):
    """Codepoints this font file has a real glyph for, read from its own
    cmap table - or None if that couldn't be determined (missing/broken
    font), in which case callers should assume full coverage rather than
    degrade. Used so a character a curated editorial face doesn't include
    (a currency symbol, say) falls back to the broad-coverage default face
    instead of rendering as a missing-glyph box."""
    try:
        from fontTools.ttLib import TTFont

        with TTFont(path_str, fontNumber=0, lazy=True) as tt:
            cmap = tt.getBestCmap()
            return frozenset(cmap.keys()) if cmap else None
    except Exception:  # noqa: BLE001 - any parse failure just disables fallback
        return None


def charset_for(bold: bool = True, family: str = DEFAULT_FAMILY):
    """`font_charset` for whichever file `font_path(bold, family)` resolves to."""
    path = font_path(bold, family)
    return font_charset(str(path)) if path is not None else None


def bundled_font_file(family: str = DEFAULT_FAMILY) -> dict:
    """URLs for fonts the deployer put in ``assets/fonts``.

    Only these are served to the browser: a system font picked up from the OS
    stays where it is rather than being redistributed. When a face is bundled
    the preview and the export use identical glyphs.
    """
    urls = {}
    for weight, bold in (("bold", True), ("regular", False)):
        path = font_path(bold, family)
        try:
            if path is not None and path.parent.resolve() == ASSET_DIR.resolve():
                urls[weight] = "/api/fonts/%s" % path.name
        except OSError:  # pragma: no cover - unreadable path
            continue
    return urls
