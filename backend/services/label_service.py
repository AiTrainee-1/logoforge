"""Bottom-centre character label ("A", "B", ... "Z", "AA", "AB", ...).

The label is burned into the exported pixels - it is not a UI overlay - so the
individual download and the ZIP both carry it.
"""
from __future__ import annotations

from dataclasses import dataclass

from PIL import Image, ImageDraw

from services.transform_service import as_float, clamp, scaled_px
from utils.fonts import load_font

BACKGROUND_STYLES = ("none", "shadow", "pill")


@dataclass
class LabelSettings:
    enabled: bool = True
    font_size: float = 36.0      # px at the 1080 px reference width
    bottom_margin: float = 30.0  # px at the 1080 px reference width
    color: str = "#FFFFFF"
    opacity: float = 100.0
    bold: bool = True
    background: str = "shadow"
    background_color: str = "#000000"
    background_opacity: float = 45.0

    @classmethod
    def from_payload(cls, data) -> "LabelSettings":
        data = data or {}
        background = str(data.get("background") or "shadow").lower()
        if background not in BACKGROUND_STYLES:
            background = "shadow"
        return cls(
            enabled=bool(data.get("enabled", True)),
            font_size=clamp(as_float(data.get("fontSize"), 36.0), 6.0, 400.0),
            bottom_margin=clamp(as_float(data.get("bottomMargin"), 30.0), 0.0, 500.0),
            color=normalise_hex(data.get("color"), "#FFFFFF"),
            opacity=clamp(as_float(data.get("opacity"), 100.0), 0.0, 100.0),
            bold=bool(data.get("bold", True)),
            background=background,
            background_color=normalise_hex(data.get("backgroundColor"), "#000000"),
            background_opacity=clamp(as_float(data.get("backgroundOpacity"), 45.0), 0.0, 100.0),
        )


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
    """Return a validated ``#rrggbb`` string."""
    rgb = parse_hex(value, None)
    if rgb is None:
        return fallback
    return "#%02X%02X%02X" % rgb


def render_label_tile(text: str, frame_w: int, settings: LabelSettings):
    """Render the label onto its own transparent tile.

    Returns ``(tile, geometry)`` where geometry carries the tile size and the
    stroke width so the caller (and the API) can describe the placement.
    """
    font_px = max(1, int(round(scaled_px(settings.font_size, frame_w))))
    font = load_font(font_px, settings.bold)
    stroke = int(round(font_px * 0.08)) if settings.background == "shadow" else 0

    measure = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bbox = measure.textbbox((0, 0), text, font=font, stroke_width=stroke)
    text_w = max(1, bbox[2] - bbox[0])
    text_h = max(1, bbox[3] - bbox[1])

    pad_x = int(round(font_px * 0.5)) if settings.background == "pill" else stroke + 2
    pad_y = int(round(font_px * 0.26)) if settings.background == "pill" else stroke + 2

    tile_w = text_w + pad_x * 2
    tile_h = text_h + pad_y * 2
    tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)

    if settings.background == "pill":
        bg_rgb = parse_hex(settings.background_color, (0, 0, 0))
        bg_alpha = int(round(255 * settings.background_opacity / 100.0))
        radius = tile_h / 2.0
        draw.rounded_rectangle(
            (0, 0, tile_w - 1, tile_h - 1), radius=radius, fill=bg_rgb + (bg_alpha,)
        )

    text_rgb = parse_hex(settings.color, (255, 255, 255))
    stroke_rgb = parse_hex(settings.background_color, (0, 0, 0))
    draw.text(
        (pad_x - bbox[0], pad_y - bbox[1]),
        text,
        font=font,
        fill=text_rgb + (255,),
        stroke_width=stroke,
        stroke_fill=stroke_rgb + (int(round(255 * 0.55)),) if stroke else None,
    )

    if settings.opacity < 100.0:
        alpha = tile.getchannel("A").point(
            lambda value, factor=settings.opacity / 100.0: int(round(value * factor))
        )
        tile.putalpha(alpha)

    geometry = {
        "fontPx": font_px,
        "strokePx": stroke,
        "width": tile_w,
        "height": tile_h,
        "padX": pad_x,
        "padY": pad_y,
    }
    return tile, geometry


def label_origin(frame_w: int, frame_h: int, tile_w: int, tile_h: int, settings: LabelSettings):
    """Bottom-centre anchor for the label tile, in frame pixels."""
    margin = scaled_px(settings.bottom_margin, frame_w)
    x = (frame_w - tile_w) / 2.0
    y = frame_h - margin - tile_h
    return int(round(x)), int(round(y))


def composite_label(frame: Image.Image, text: str, settings: LabelSettings) -> Image.Image:
    """Burn the label into ``frame`` (RGBA) and return it."""
    from services.logo_processor import paste_rgba

    if not settings.enabled or not text or settings.opacity <= 0:
        return frame
    frame_w, frame_h = frame.size
    tile, _ = render_label_tile(text, frame_w, settings)
    x, y = label_origin(frame_w, frame_h, tile.width, tile.height, settings)
    return paste_rgba(frame, tile, x, y)
