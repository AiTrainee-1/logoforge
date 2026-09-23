"""The shared transformation model.

This module is the single source of truth for *where* things end up in the
output frame. ``frontend/src/utils/transforms.ts`` is a line-by-line port of
the functions below, so the on-screen preview and the rendered file agree.

The model
---------
Output frame
    ``original``      -> the source image's own pixel dimensions
    instagram presets -> the preset's fixed dimensions

Image placement
    1. ``baseScale`` makes the source *cover* (or *contain*) the frame.
    2. ``transform.scale`` multiplies it - this is the user's zoom.
    3. ``offsetX`` / ``offsetY`` shift the image, expressed as a percentage of
       the frame width / height so the value is resolution independent: the
       same numbers describe a 480 px preview and a 4000 px export.

Reference-width scaling
    Logo margin, label size and label margin are authored in pixels against a
    1080 px wide reference frame and multiplied by ``frameWidth / 1080`` so a
    30 px margin looks the same on a 1080 px and a 4000 px export.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

# Frame width the pixel-valued settings (margins, font size) are authored for.
REFERENCE_WIDTH = 1080.0

EXPORT_PRESETS = {
    "original": None,
    "instagram-portrait": (1080, 1350),
    "instagram-square": (1080, 1080),
    "instagram-landscape": (1080, 566),
}


@dataclass
class Transform:
    """Per-image placement. Never shared between images."""

    scale: float = 1.0
    offset_x: float = 0.0  # percent of frame width,  -100..100
    offset_y: float = 0.0  # percent of frame height, -100..100

    @classmethod
    def from_payload(cls, data) -> "Transform":
        data = data or {}
        return cls(
            scale=clamp(as_float(data.get("scale"), 1.0), 0.05, 10.0),
            offset_x=clamp(as_float(data.get("offsetX"), 0.0), -400.0, 400.0),
            offset_y=clamp(as_float(data.get("offsetY"), 0.0), -400.0, 400.0),
        )


@dataclass
class Placement:
    """Where the source image lands inside the frame, in frame pixels."""

    x: float
    y: float
    width: float
    height: float
    scale: float  # effective source-pixel -> frame-pixel factor

    def as_dict(self) -> dict:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "scale": self.scale,
        }


@dataclass
class ExportSettings:
    format: str = "original"
    fit: str = "cover"
    quality: int = 100
    width: int | None = None
    height: int | None = None
    background: str = "#FFFFFF"
    keep_transparency: bool = True
    output_format: str = "auto"  # auto | jpeg | png | webp
    extra: dict = field(default_factory=dict)

    @classmethod
    def from_payload(cls, data) -> "ExportSettings":
        data = data or {}
        fmt = str(data.get("format") or "original").lower()
        if fmt not in EXPORT_PRESETS and fmt != "custom":
            fmt = "original"
        fit = str(data.get("fit") or "cover").lower()
        if fit not in ("cover", "contain"):
            fit = "cover"
        out_fmt = str(data.get("outputFormat") or "auto").lower()
        if out_fmt not in ("auto", "jpeg", "png", "webp"):
            out_fmt = "auto"
        return cls(
            format=fmt,
            fit=fit,
            quality=int(clamp(as_float(data.get("quality"), 100.0), 1.0, 100.0)),
            width=as_optional_int(data.get("width")),
            height=as_optional_int(data.get("height")),
            background=str(data.get("background") or "#FFFFFF"),
            keep_transparency=bool(data.get("keepTransparency", True)),
            output_format=out_fmt,
        )


def as_float(value, default: float) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(result) or math.isinf(result):
        return default
    return result


def as_optional_int(value):
    try:
        result = int(value)
    except (TypeError, ValueError):
        return None
    return result if result > 0 else None


def clamp(value: float, low: float, high: float) -> float:
    return low if value < low else high if value > high else value


def compute_frame(src_w: int, src_h: int, export: ExportSettings):
    """Resolve the output frame size for one source image."""
    if export.format == "custom" and export.width and export.height:
        return int(export.width), int(export.height)
    preset = EXPORT_PRESETS.get(export.format)
    if preset is None:
        # "Original": the frame *is* the source. Nothing is resized.
        return int(src_w), int(src_h)
    return int(preset[0]), int(preset[1])


def base_scale(src_w: int, src_h: int, frame_w: int, frame_h: int, fit: str = "cover") -> float:
    """Scale that makes the source cover (or fit inside) the frame."""
    if src_w <= 0 or src_h <= 0:
        return 1.0
    sx = frame_w / float(src_w)
    sy = frame_h / float(src_h)
    return max(sx, sy) if fit == "cover" else min(sx, sy)


def compute_placement(
    src_w: int,
    src_h: int,
    frame_w: int,
    frame_h: int,
    transform: Transform,
    fit: str = "cover",
) -> Placement:
    """Return the drawn rectangle of the source inside the frame."""
    effective = base_scale(src_w, src_h, frame_w, frame_h, fit) * max(transform.scale, 1e-6)
    draw_w = src_w * effective
    draw_h = src_h * effective
    x = (frame_w - draw_w) / 2.0 + (transform.offset_x / 100.0) * frame_w
    y = (frame_h - draw_h) / 2.0 + (transform.offset_y / 100.0) * frame_h
    return Placement(x=x, y=y, width=draw_w, height=draw_h, scale=effective)


def reference_factor(frame_w: int) -> float:
    """Multiplier turning reference-width pixels into frame pixels."""
    return max(frame_w, 1) / REFERENCE_WIDTH


def scaled_px(value: float, frame_w: int) -> float:
    return value * reference_factor(frame_w)


def is_identity(placement: Placement, frame_w: int, frame_h: int, src_w: int, src_h: int) -> bool:
    """True when the source can be copied pixel-for-pixel with no resampling."""
    return (
        abs(placement.scale - 1.0) < 1e-9
        and abs(placement.x) < 1e-6
        and abs(placement.y) < 1e-6
        and frame_w == src_w
        and frame_h == src_h
    )
