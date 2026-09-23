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
from utils.fonts import load_font

ALIGNMENTS = ("left", "center", "right")
BACKGROUNDS = ("none", "shadow", "pill")

MAX_TEXT_LENGTH = 500
MAX_LINES = 20


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

    @classmethod
    def from_payload(cls, data) -> "TextStyle":
        data = data or {}
        align = str(data.get("align") or "center").lower()
        background = str(data.get("background") or "shadow").lower()
        return cls(
            font_size=clamp(as_float(data.get("fontSize"), 40.0), 4.0, 600.0),
            line_height=clamp(as_float(data.get("lineHeight"), 1.2), 0.6, 3.0),
            color=normalise_hex(data.get("color"), "#FFFFFF"),
            bold=bool(data.get("bold", True)),
            align=align if align in ALIGNMENTS else "center",
            background=background if background in BACKGROUNDS else "shadow",
            background_color=normalise_hex(data.get("backgroundColor"), "#000000"),
            background_opacity=clamp(as_float(data.get("backgroundOpacity"), 45.0), 0.0, 100.0),
        )


def clean_text(value) -> str:
    """Trim a client string to something safe to lay out."""
    if not isinstance(value, str):
        return ""
    text = value.replace("\r\n", "\n").replace("\r", "\n")[:MAX_TEXT_LENGTH]
    lines = text.split("\n")[:MAX_LINES]
    return "\n".join(lines)


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

    font = load_font(font_px, style.bold)
    lines = text.split("\n") if text else [""]

    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    widths = [probe.textlength(line, font=font) for line in lines]
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
        draw.text(
            (origin_x, baseline),
            line,
            font=font,
            fill=fill,
            anchor=anchor,
            stroke_width=stroke,
            stroke_fill=stroke_fill,
        )

    if opacity < 100.0:
        alpha = tile.getchannel("A").point(
            lambda value, factor=max(0.0, opacity) / 100.0: int(round(value * factor))
        )
        tile.putalpha(alpha)

    geometry = dict(metrics)
    geometry.update({"width": tile_w, "height": tile_h, "lines": len(lines)})
    return tile, geometry
