"""Text block rendering that follows the CSS line box model.

Arbitrary user text has to land in the same place in the browser preview and in
the exported pixels. Browsers lay a line out as::

    line box height = fontSize * lineHeight
    half leading    = (line box height - (ascent + descent)) / 2
    baseline        = half leading + ascent

Pillow exposes the very same ``ascent``/``descent`` through
``ImageFont.getmetrics()``, so reproducing that arithmetic here makes the two
renderers agree line for line. What is left is the font file itself: drop the
preview's font into ``assets/fonts`` and the match becomes exact.
"""
from __future__ import annotations

from dataclasses import dataclass

from PIL import Image, ImageDraw

from services.transform_service import as_float, clamp, scaled_px
from utils.fonts import DEFAULT_FAMILY as DEFAULT_FONT_FAMILY
from utils.fonts import charset_for, load_font
from utils.icons import icon_for_line, tinted_icon

ALIGNMENTS = ("left", "center", "right")
BACKGROUNDS = ("none", "shadow", "pill")
FONT_FAMILIES = ("default", "serif")

MAX_TEXT_LENGTH = 4000
MAX_LINES = 80


def parse_hex(value, fallback=(255, 255, 255)):
    """Parse ``#rgb`` / ``#rrggbb`` into an RGB tuple, falling back safely."""
    if not isinstance(value, str):
        return fallback
    text = value.strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        return fallback
    try:
        return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
    except ValueError:
        return fallback


def normalise_hex(value, fallback: str) -> str:
    rgb = parse_hex(value, None)
    return fallback if rgb is None else "#%02X%02X%02X" % rgb


@dataclass
class TextStyle:
    """Everything about how a text block looks. Sizes are reference pixels."""

    font_size: float = 40.0
    line_height: float = 1.2
    color: str = "#FFFFFF"
    bold: bool = True
    align: str = "center"
    background: str = "shadow"
    background_color: str = "#000000"
    background_opacity: float = 45.0
    letter_spacing: float = 0.0
    # Which bundled family (see utils/fonts.py) this text renders with.
    # "default" is the original face every existing text element already
    # uses; only the Catalog Composer's sections opt into anything else.
    font_family: str = "default"

    @classmethod
    def from_payload(cls, data) -> "TextStyle":
        data = data or {}
        align = str(data.get("align") or "center").lower()
        background = str(data.get("background") or "shadow").lower()
        font_family = str(data.get("fontFamily") or "default").lower()
        if font_family not in FONT_FAMILIES:
            font_family = "default"
        return cls(
            font_size=clamp(as_float(data.get("fontSize"), 40.0), 4.0, 600.0),
            line_height=clamp(as_float(data.get("lineHeight"), 1.2), 0.6, 3.0),
            color=normalise_hex(data.get("color"), "#FFFFFF"),
            bold=bool(data.get("bold", True)),
            align=align if align in ALIGNMENTS else "center",
            background=background if background in BACKGROUNDS else "shadow",
            background_color=normalise_hex(data.get("backgroundColor"), "#000000"),
            background_opacity=clamp(as_float(data.get("backgroundOpacity"), 45.0), 0.0, 100.0),
            letter_spacing=clamp(as_float(data.get("letterSpacing"), 0.0), -20.0, 200.0),
            font_family=font_family,
        )


def clean_text(value) -> str:
    """Trim a client string to something safe to lay out."""
    if not isinstance(value, str):
        return ""
    text = value.replace("\r\n", "\n").replace("\r", "\n")[:MAX_TEXT_LENGTH]
    lines = text.split("\n")[:MAX_LINES]
    return "\n".join(lines)


@dataclass
class GlyphFonts:
    """The font actually requested, plus a fallback to use for any character
    it doesn't have a glyph for - a currency symbol or similar that a curated
    editorial face may not include. `fallback` is None when there is nothing
    more general to fall back to (the request was already "default"), or
    when charset introspection isn't available."""

    primary: object
    primary_charset: object = None
    fallback: object = None
    fallback_charset: object = None


def resolve_glyph_fonts(font_px: int, bold: bool, family: str) -> GlyphFonts:
    primary = load_font(font_px, bold, family)
    primary_charset = charset_for(bold, family)
    if family == DEFAULT_FONT_FAMILY or primary_charset is None:
        return GlyphFonts(primary, primary_charset)
    fallback = load_font(font_px, bold, DEFAULT_FONT_FAMILY)
    fallback_charset = charset_for(bold, DEFAULT_FONT_FAMILY)
    return GlyphFonts(primary, primary_charset, fallback, fallback_charset)


def _font_for_char(char: str, fonts: "GlyphFonts"):
    if fonts.primary_charset is None or char.isspace() or ord(char) in fonts.primary_charset:
        return fonts.primary
    if fonts.fallback is not None and (
        fonts.fallback_charset is None or ord(char) in fonts.fallback_charset
    ):
        return fonts.fallback
    return fonts.primary  # neither covers it - an honest, rare missing-glyph box


def _line_needs_fallback(line: str, fonts: "GlyphFonts") -> bool:
    if fonts.fallback is None or fonts.primary_charset is None:
        return False
    return any(not ch.isspace() and ord(ch) not in fonts.primary_charset for ch in line)


def _line_width(draw, line: str, font, letter_spacing_px: float = 0.0, fonts: "GlyphFonts | None" = None) -> float:
    """Line width including letter-spacing gaps (one gap between each pair).

    When `fonts` is given and the line needs its fallback for at least one
    character, width is summed per character using whichever font actually
    draws it - otherwise (the common case) it's one fast `textlength` call.
    """
    if not line:
        return 0.0
    if fonts is None or not _line_needs_fallback(line, fonts):
        width = draw.textlength(line, font=font)
        if letter_spacing_px and len(line) > 1:
            width += letter_spacing_px * (len(line) - 1)
        return width
    total = 0.0
    for index, char in enumerate(line):
        total += draw.textlength(char, font=_font_for_char(char, fonts))
        if letter_spacing_px and index < len(line) - 1:
            total += letter_spacing_px
    return total


def _draw_line(draw, x, baseline, line, font, fill, anchor, letter_spacing_px, stroke_width, stroke_fill, fonts: "GlyphFonts | None" = None):
    """Draw one line. Falls back to glyph-by-glyph placement only when
    letter-spacing is requested or the line needs a fallback font for at
    least one character - so the common case (single font, no spacing)
    keeps using Pillow's own single-call text layout unchanged."""
    mixed = fonts is not None and _line_needs_fallback(line, fonts)
    if not mixed and (not letter_spacing_px or len(line) <= 1):
        draw.text(
            (x, baseline), line, font=font, fill=fill, anchor=anchor,
            stroke_width=stroke_width, stroke_fill=stroke_fill,
        )
        return
    total = _line_width(draw, line, font, letter_spacing_px, fonts)
    if anchor.startswith("m"):
        cursor = x - total / 2.0
    elif anchor.startswith("r"):
        cursor = x - total
    else:
        cursor = x
    for char in line:
        char_font = _font_for_char(char, fonts) if mixed else font
        draw.text(
            (cursor, baseline), char, font=char_font, fill=fill, anchor="ls",
            stroke_width=stroke_width, stroke_fill=stroke_fill,
        )
        cursor += draw.textlength(char, font=char_font) + letter_spacing_px


def _wrap_paragraph(draw, paragraph: str, font, max_width_px: float, letter_spacing_px: float = 0.0, fonts: "GlyphFonts | None" = None) -> list:
    """Greedy word-wrap of a single paragraph (no newlines in it) to
    ``max_width_px``. A single word wider than the box is kept whole on its
    own line rather than being cut mid-word: content is never dropped, only
    overflowed."""
    if paragraph == "":
        return [""]
    if max_width_px <= 0:
        return [paragraph]
    wrapped = []
    line = ""
    for word in paragraph.split(" "):
        candidate = word if not line else line + " " + word
        if not line or _line_width(draw, candidate, font, letter_spacing_px, fonts) <= max_width_px:
            line = candidate
        else:
            wrapped.append(line)
            line = word
    wrapped.append(line)
    return wrapped


def wrap_lines(draw, text: str, font, max_width_px: float, letter_spacing_px: float = 0.0) -> list:
    """Greedy word-wrap to ``max_width_px``. Explicit newlines stay paragraph
    breaks - pasted catalog text is never silently rearranged, only wrapped.
    """
    if max_width_px <= 0:
        return text.split("\n") if text else [""]
    wrapped = []
    for paragraph in text.split("\n"):
        wrapped.extend(_wrap_paragraph(draw, paragraph, font, max_width_px, letter_spacing_px))
    return wrapped or [""]


def text_metrics(frame_w: int, style: TextStyle) -> dict:
    """Pixel geometry of the block, without drawing it."""
    font_px = max(1, int(round(scaled_px(style.font_size, frame_w))))
    stroke = int(round(font_px * 0.08)) if style.background == "shadow" else 0
    if style.background == "pill":
        pad_x = int(round(font_px * 0.5))
        pad_y = int(round(font_px * 0.26))
    else:
        pad_x = stroke + 2
        pad_y = stroke + 2
    return {
        "fontPx": font_px,
        "strokePx": stroke,
        "padX": pad_x,
        "padY": pad_y,
        "lineHeightPx": int(round(font_px * style.line_height)),
    }


def render_text_block(text: str, frame_w: int, style: TextStyle, opacity: float = 100.0):
    """Render ``text`` onto its own transparent tile.

    Returns ``(tile, geometry)``. The tile is what gets rotated and pasted, so
    its centre is the element's anchor point - exactly like a CSS box with
    ``transform: translate(-50%, -50%) rotate(...)``.
    """
    text = clean_text(text)
    metrics = text_metrics(frame_w, style)
    font_px = metrics["fontPx"]
    stroke = metrics["strokePx"]
    pad_x = metrics["padX"]
    pad_y = metrics["padY"]
    line_h = metrics["lineHeightPx"]

    fonts = resolve_glyph_fonts(font_px, style.bold, style.font_family)
    font = fonts.primary
    lines = text.split("\n") if text else [""]
    letter_px = scaled_px(style.letter_spacing, frame_w)

    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    widths = [_line_width(probe, line, font, letter_px, fonts) for line in lines]
    text_w = max(widths) if widths else 0
    # The stroke grows the ink on both sides of every glyph.
    content_w = int(round(text_w)) + stroke * 2
    content_h = line_h * len(lines)

    tile_w = max(1, content_w + pad_x * 2)
    tile_h = max(1, content_h + pad_y * 2)
    tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)

    if style.background == "pill":
        radius = min(tile_w, tile_h) / 2.0  # matches CSS border-radius: 9999px
        draw.rounded_rectangle(
            (0, 0, tile_w - 1, tile_h - 1),
            radius=radius,
            fill=parse_hex(style.background_color, (0, 0, 0))
            + (int(round(255 * style.background_opacity / 100.0)),),
        )

    ascent, descent = font.getmetrics()
    half_leading = (line_h - (ascent + descent)) / 2.0
    fill = parse_hex(style.color, (255, 255, 255)) + (255,)
    stroke_fill = parse_hex(style.background_color, (0, 0, 0)) + (140,) if stroke else None

    if style.align == "left":
        anchor, origin_x = "ls", pad_x + stroke
    elif style.align == "right":
        anchor, origin_x = "rs", tile_w - pad_x - stroke
    else:
        anchor, origin_x = "ms", tile_w / 2.0

    for index, line in enumerate(lines):
        baseline = pad_y + index * line_h + half_leading + ascent
        _draw_line(draw, origin_x, baseline, line, font, fill, anchor, letter_px, stroke, stroke_fill, fonts)

    if opacity < 100.0:
        alpha = tile.getchannel("A").point(
            lambda value, factor=max(0.0, opacity) / 100.0: int(round(value * factor))
        )
        tile.putalpha(alpha)

    geometry = dict(metrics)
    geometry.update({"width": tile_w, "height": tile_h, "lines": len(lines)})
    return tile, geometry


def render_text_box(
    text: str,
    frame_w: int,
    style: TextStyle,
    box_width_px: float,
    box_height_px: float = 0.0,
    opacity: float = 100.0,
    show_icons: bool = False,
):
    """Render ``text`` word-wrapped to a fixed-width box (the catalog text box).

    Unlike ``render_text_block`` (which auto-sizes its tile to whatever the
    text needs, never wrapping except on explicit newlines), this wraps to
    ``box_width_px`` and returns ``(tile, geometry)`` sized to fit. Text is
    never clipped: ``box_height_px`` is a *target* height, and the tile grows
    taller than it whenever the wrapped content genuinely needs more room.

    ``show_icons`` prefixes each recognised catalog field line ("Material:",
    "Dimensions:", "Weight:", "Price:", ...) with a small icon, tinted to
    ``style.color`` so it always matches the text. Off by default; only a
    line that already starts a Details/Price field gets one - continuation
    lines (the "C:"/"D:" rows under "Dimensions:") never do.
    """
    text = clean_text(text)
    metrics = text_metrics(frame_w, style)
    font_px = metrics["fontPx"]
    stroke = metrics["strokePx"]
    pad_x = metrics["padX"]
    pad_y = metrics["padY"]
    line_h = metrics["lineHeightPx"]
    letter_px = scaled_px(style.letter_spacing, frame_w)

    fonts = resolve_glyph_fonts(font_px, style.bold, style.font_family)
    font = fonts.primary
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    inner_width = max(1.0, box_width_px - pad_x * 2)

    # Each source line is wrapped on its own so an icon (if any) can be
    # attached to exactly the first wrapped sub-line of that source line -
    # wrapping still happens at the full inner_width either way, so an icon
    # line whose text alone is close to the box width may, rarely, sit a
    # little tight against the icon rather than reflowing around it.
    lines: list = []
    line_icons: list = []
    for source_line in text.split("\n"):
        icon_name = icon_for_line(source_line) if show_icons else None
        sub_lines = _wrap_paragraph(probe, source_line, font, inner_width, letter_px, fonts)
        for sub_index, sub_line in enumerate(sub_lines):
            lines.append(sub_line)
            line_icons.append(icon_name if sub_index == 0 else None)

    content_h = line_h * len(lines)
    tile_w = max(1, int(round(box_width_px)))
    tile_h = max(1, int(round(max(box_height_px, content_h + pad_y * 2))))
    tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)

    if style.background == "pill":
        radius = min(tile_w, tile_h) / 2.0
        draw.rounded_rectangle(
            (0, 0, tile_w - 1, tile_h - 1),
            radius=radius,
            fill=parse_hex(style.background_color, (0, 0, 0))
            + (int(round(255 * style.background_opacity / 100.0)),),
        )

    ascent, descent = font.getmetrics()
    half_leading = (line_h - (ascent + descent)) / 2.0
    text_color = parse_hex(style.color, (255, 255, 255))
    fill = text_color + (255,)
    stroke_fill = parse_hex(style.background_color, (0, 0, 0)) + (140,) if stroke else None

    if style.align == "left":
        anchor, origin_x = "ls", pad_x + stroke
    elif style.align == "right":
        anchor, origin_x = "rs", tile_w - pad_x - stroke
    else:
        anchor, origin_x = "ms", tile_w / 2.0

    icon_size = max(1, int(round(font_px * 0.85)))
    icon_gap = max(1, int(round(font_px * 0.32)))

    for index, line in enumerate(lines):
        baseline = pad_y + index * line_h + half_leading + ascent
        icon_name = line_icons[index]
        # Full alpha here - like `fill`'s alpha=255 above, overall opacity is
        # applied once, uniformly, to the whole tile at the end.
        icon = tinted_icon(icon_name, icon_size, text_color) if icon_name else None

        if icon is None:
            _draw_line(draw, origin_x, baseline, line, font, fill, anchor, letter_px, stroke, stroke_fill, fonts)
            continue

        # Icon + text render as one left-to-right unit, positioned as a
        # whole according to the configured alignment.
        text_w = _line_width(probe, line, font, letter_px, fonts)
        unit_w = icon_size + icon_gap + text_w
        if style.align == "left":
            unit_x = pad_x + stroke
        elif style.align == "right":
            unit_x = tile_w - pad_x - stroke - unit_w
        else:
            unit_x = (tile_w - unit_w) / 2.0

        icon_y = pad_y + index * line_h + (line_h - icon_size) / 2.0
        tile.alpha_composite(icon, (int(round(unit_x)), int(round(icon_y))))
        text_x = unit_x + icon_size + icon_gap
        _draw_line(draw, text_x, baseline, line, font, fill, "ls", letter_px, stroke, stroke_fill, fonts)

    if opacity < 100.0:
        alpha = tile.getchannel("A").point(
            lambda value, factor=max(0.0, opacity) / 100.0: int(round(value * factor))
        )
        tile.putalpha(alpha)

    geometry = dict(metrics)
    geometry.update(
        {"width": tile_w, "height": tile_h, "lines": len(lines), "letterSpacingPx": letter_px}
    )
    return tile, geometry
