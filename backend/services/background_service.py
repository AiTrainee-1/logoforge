"""Frame background: a fixed colour, or one matched to the photo's own edges.

When a photo doesn't cover its export frame (``contain`` fit, or scaled down),
the uncovered part of the frame shows the background. A product shot on a grey
sweep then sits between white bands. "Match background" fills the frame with
the colour along the photo's own edges instead, so the backdrop carries on to
the edge of the frame.

* ``analyse_edges`` measures that colour once, at upload. The result is stored
  with the upload and sent to the browser, and the renderer reuses the stored
  numbers, so the preview and the exported file use exactly the same colours.
* ``background_fill`` / ``paint_background`` turn the settings into pixels: a
  solid colour, or a top-to-bottom blend of the top and bottom edge colours.
* ``seam_mask`` fades the photo's edges where they meet the background, so a
  slight colour difference doesn't show as a hard line.

``frontend/src/utils/background.ts`` is the preview's port of the fill and seam
geometry below.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops

from services.label_service import parse_hex
from services.transform_service import ExportSettings, Placement, scaled_px

# The analysis works on a copy whose long side is at most this many pixels.
# Shrinking first averages away sensor noise and JPEG grain.
SAMPLE_SIZE = 320
# Edge strip thickness, as a share of the copy's short side (at least 2 px).
STRIP_FRACTION = 0.015
# Per-channel distance (0-255) within which an edge pixel counts as the same
# colour. Only used to report how plain the backdrop is.
MATCH_TOLERANCE = 12
# Share of edge pixels that must be opaque for the photo to have a backdrop at
# all. Below it the photo is a cut-out, and its few opaque edge pixels are the
# product itself: matching them would flood the frame with the product colour.
MIN_OPAQUE_SHARE = 0.9
# Modes that can be shrunk as they are. Anything else (palette, CMYK, 16-bit,
# float...) is converted to RGBA first.
RESAMPLE_MODES = ("RGB", "RGBA", "L", "LA")
# EXIF orientation -> the transpose that shows the photo upright. The same
# table ImageOps.exif_transpose uses, so the renderer's open_source() agrees.
ORIENTATION_TRANSPOSE = {
    2: Image.Transpose.FLIP_LEFT_RIGHT,
    3: Image.Transpose.ROTATE_180,
    4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE,
    6: Image.Transpose.ROTATE_270,
    7: Image.Transpose.TRANSVERSE,
    8: Image.Transpose.ROTATE_90,
}
# Smoothstep sampled at six points. The preview's CSS mask uses the same stops,
# so a softened edge fades the same way on screen and in the file.
EASE_STOPS = (
    (0.0, 0.0),
    (0.2, 0.104),
    (0.4, 0.352),
    (0.6, 0.648),
    (0.8, 0.896),
    (1.0, 1.0),
)
SIDES = ("top", "bottom", "left", "right")
WHITE = (255, 255, 255)


# --------------------------------------------------------------------------
# Measuring the edges
# --------------------------------------------------------------------------

def analyse_edges(path: Path) -> dict | None:
    """Measure the colour along each edge of the image at ``path``.

    Returns ``{"transparent": True}`` when the edges are see-through (a cut-out
    product), the measured colours otherwise, or ``None`` when the file can't
    be analysed. Never raises: matching is a convenience, not a reason to fail
    an upload or a render.
    """
    try:
        with Image.open(path) as img:
            # JPEG can decode at 1/2, 1/4 or 1/8 scale straight from its DCT
            # data - far faster than a full decode and ample for a colour
            # sample. Other formats ignore the hint.
            img.draft(img.mode, (SAMPLE_SIZE * 2, SAMPLE_SIZE * 2))
            img.load()
            sample = _upright_sample(img)
        try:
            return edge_colors(sample)
        finally:
            sample.close()
    except Exception:  # noqa: BLE001
        return None


def _upright_sample(img: Image.Image) -> Image.Image:
    """A small RGBA copy of ``img``, turned upright the way the renderer turns it.

    The photo is shrunk before anything else, so no full-size copy is ever
    made: measuring a 120 MP upload costs little more than decoding it. Turning
    the small copy gives the same result as turning the photo first, because
    the box filter is symmetric.
    """
    try:
        orientation = img.getexif().get(0x0112, 1)
    except Exception:  # noqa: BLE001 - broken EXIF: the renderer keeps the stored pixels too
        orientation = 1

    source = img if img.mode in RESAMPLE_MODES else img.convert("RGBA")
    try:
        width, height = source.size
        scale = min(1.0, SAMPLE_SIZE / float(max(width, height)))
        size = (max(1, round(width * scale)), max(1, round(height * scale)))
        if size != source.size:
            sample = source.resize(size, Image.Resampling.BOX)
        else:
            sample = source.copy()
    finally:
        if source is not img:
            source.close()

    if sample.mode != "RGBA":
        converted = sample.convert("RGBA")
        sample.close()
        sample = converted
    method = ORIENTATION_TRANSPOSE.get(orientation)
    if method is not None:
        upright = sample.transpose(method)
        sample.close()
        sample = upright
    return sample


def edge_colors(image: Image.Image) -> dict:
    """Median colour of a thin strip along each edge of an RGBA image.

    The median ignores a minority of odd pixels, so a shadow or the product
    itself touching one edge doesn't drag the colour off. ``agreement`` is
    the share of edge pixels close to the result: near 1.0 for a plain
    backdrop, lower for a busy one. When less than ``MIN_OPAQUE_SHARE`` of
    the edge is opaque the photo is a cut-out with no backdrop to continue,
    and the result is ``{"transparent": True}``.
    """
    width, height = image.size
    strip = max(2, round(min(width, height) * STRIP_FRACTION))
    strip = max(1, min(strip, width // 2, height // 2))
    boxes = {
        "top": (0, 0, width, strip),
        "bottom": (0, height - strip, width, height),
        # The side strips stop short of the corners, which top and bottom own.
        "left": (0, strip, strip, height - strip),
        "right": (width - strip, strip, width, height - strip),
    }

    pixels: dict[str, list] = {}
    total = 0
    for side, box in boxes.items():
        if box[2] <= box[0] or box[3] <= box[1]:
            pixels[side] = []
            continue
        with image.crop(box) as region:
            strip_pixels = list(region.getdata())
        total += len(strip_pixels)
        # Pixels that are mostly transparent have no colour to match.
        pixels[side] = [p for p in strip_pixels if p[3] >= 128]

    everything = [p for side in SIDES for p in pixels[side]]
    if not everything or len(everything) < MIN_OPAQUE_SHARE * total:
        return {"transparent": True}

    color = _median(everything)
    close = sum(1 for p in everything if _distance(p, color) <= MATCH_TOLERANCE)
    result = {
        "transparent": False,
        "color": to_hex(color),
        "agreement": round(close / len(everything), 3),
    }
    for side in SIDES:
        result[side] = to_hex(_median(pixels[side])) if pixels[side] else result["color"]
    return result


def _median(pixels: list) -> tuple:
    """Per-channel lower median."""
    middle = (len(pixels) - 1) // 2
    return tuple(sorted(p[channel] for p in pixels)[middle] for channel in range(3))


def _distance(a, b) -> int:
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def to_hex(rgb) -> str:
    return "#%02X%02X%02X" % (rgb[0], rgb[1], rgb[2])


# --------------------------------------------------------------------------
# Painting the background
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class Fill:
    """What sits under the photo: one colour, or a top-to-bottom blend."""

    top: tuple
    bottom: tuple

    @property
    def solid(self) -> bool:
        return self.top == self.bottom


def matched_edges(export: ExportSettings, edges: dict | None) -> dict | None:
    """The edge colours to fill with, when matching is on and the photo has some."""
    if export.background_mode != "match" or not edges or edges.get("transparent"):
        return None
    return edges


def background_fill(export: ExportSettings, edges: dict | None) -> Fill:
    """Resolve the settings (and the photo's edges) into a ``Fill``."""
    matched = matched_edges(export, edges)
    if matched is None:
        color = parse_hex(export.background, WHITE)
        return Fill(color, color)
    overall = parse_hex(matched.get("color"), WHITE)
    if export.background_style == "vertical":
        return Fill(
            parse_hex(matched.get("top"), overall),
            parse_hex(matched.get("bottom"), overall),
        )
    return Fill(overall, overall)


def paint_background(size: tuple, fill: Fill, placement: Placement) -> Image.Image:
    """An opaque RGBA frame painted with ``fill``.

    A blend holds the top colour down to the photo's top edge, moves to the
    bottom colour by the photo's bottom edge and holds it below, so each band
    of background matches the photo edge it touches. The blend is anchored to
    the photo's real top and bottom even when they lie outside the frame, so
    the bands beside a cropped photo still follow its edges.
    """
    frame_w, frame_h = size
    if fill.solid:
        return Image.new("RGBA", size, tuple(fill.top) + (255,))

    start = placement.y
    end = placement.y + placement.height
    column = []
    for row in range(frame_h):
        centre = row + 0.5
        if centre <= start:
            t = 0.0
        elif centre >= end:
            t = 1.0
        else:
            t = (centre - start) / (end - start)
        column.append(
            tuple(int(round(a + (b - a) * t)) for a, b in zip(fill.top, fill.bottom))
            + (255,)
        )
    strip = Image.new("RGBA", (1, frame_h))
    strip.putdata(column)
    painted = strip.resize(size, Image.Resampling.NEAREST)
    strip.close()
    return painted


# --------------------------------------------------------------------------
# Softening the seam
# --------------------------------------------------------------------------

def open_edges(placement: Placement, frame_w: int, frame_h: int) -> tuple:
    """``(left, right, top, bottom)``: sides of the photo with background beyond."""
    return (
        placement.x > 0.5,
        placement.x + placement.width < frame_w - 0.5,
        placement.y > 0.5,
        placement.y + placement.height < frame_h - 0.5,
    )


def ease(t: float) -> float:
    """Piecewise-linear smoothstep through ``EASE_STOPS``."""
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    for (t0, v0), (t1, v1) in zip(EASE_STOPS, EASE_STOPS[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * (t - t0) / (t1 - t0)
    return 1.0  # pragma: no cover - the last stop is (1.0, 1.0)


def seam_width(export: ExportSettings, placement: Placement, frame_w: int) -> float:
    """Fade width in frame pixels, capped so opposite fades never overlap."""
    width = scaled_px(export.seam_soften, frame_w)
    return min(width, placement.width / 2.0, placement.height / 2.0)


def seam_mask(size: tuple, placement: Placement, width: float) -> Image.Image | None:
    """An ``L`` mask that fades the photo's open edges over ``width`` pixels.

    Returns ``None`` when nothing would fade: softening is off, or the photo
    covers the frame so no edge meets the background.
    """
    frame_w, frame_h = size
    left, right, top, bottom = open_edges(placement, frame_w, frame_h)
    if width < 0.5 or not (left or right or top or bottom):
        return None

    mask = None
    if left or right:
        row = Image.new("L", (frame_w, 1))
        row.putdata(
            _profile(frame_w, placement.x, placement.x + placement.width, width, left, right)
        )
        mask = row.resize(size, Image.Resampling.NEAREST)
        row.close()
    if top or bottom:
        column = Image.new("L", (1, frame_h))
        column.putdata(
            _profile(frame_h, placement.y, placement.y + placement.height, width, top, bottom)
        )
        stretched = column.resize(size, Image.Resampling.NEAREST)
        column.close()
        if mask is None:
            mask = stretched
        else:
            combined = ImageChops.multiply(mask, stretched)
            mask.close()
            stretched.close()
            mask = combined
    return mask


def _profile(length: int, start: float, end: float, width: float, fade_start: bool, fade_end: bool) -> list:
    """Opacity (0-255) along one axis of the frame, sampled at pixel centres."""
    values = []
    for index in range(length):
        centre = index + 0.5
        level = 1.0
        if fade_start:
            level *= ease((centre - start) / width)
        if fade_end:
            level *= ease((end - centre) / width)
        values.append(int(round(level * 255)))
    return values
