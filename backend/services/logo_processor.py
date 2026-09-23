"""Logo / watermark compositing.

The logo is placed relative to the *output frame*, never relative to the source
image, so repositioning the photo underneath never moves the logo.

Geometry (mirrored by ``frontend/src/utils/transforms.ts``):

1. width  = ``sizePercent`` % of the frame width, height follows the logo's own
   aspect ratio - the logo is never stretched.
2. the un-rotated box is anchored by ``position`` + ``margin`` (margin is
   authored against a 1080 px reference frame and scaled up with the output).
3. rotation happens about that box's centre, exactly like a CSS
   ``transform: rotate()`` so the preview matches.
"""
from __future__ import annotations

from dataclasses import dataclass

from PIL import Image

from services.transform_service import as_float, clamp, scaled_px

POSITIONS = ("top-left", "top-right", "bottom-left", "bottom-right", "center", "custom")


@dataclass
class LogoSettings:
    position: str = "top-right"
    size_percent: float = 12.0
    margin: float = 30.0
    opacity: float = 100.0
    rotation: float = 0.0
    custom_x: float = 50.0  # percent of frame width  (centre of the logo box)
    custom_y: float = 50.0  # percent of frame height

    @classmethod
    def from_payload(cls, data) -> "LogoSettings":
        data = data or {}
        position = str(data.get("position") or "top-right").lower()
        if position not in POSITIONS:
            position = "top-right"
        return cls(
            position=position,
            size_percent=clamp(as_float(data.get("sizePercent"), 12.0), 0.5, 100.0),
            margin=clamp(as_float(data.get("margin"), 30.0), 0.0, 400.0),
            opacity=clamp(as_float(data.get("opacity"), 100.0), 0.0, 100.0),
            rotation=clamp(as_float(data.get("rotation"), 0.0), -180.0, 180.0),
            custom_x=clamp(as_float(data.get("customX"), 50.0), -50.0, 150.0),
            custom_y=clamp(as_float(data.get("customY"), 50.0), -50.0, 150.0),
        )


def logo_box(frame_w: int, frame_h: int, logo_w: int, logo_h: int, settings: LogoSettings):
    """Return ``(x, y, width, height)`` of the un-rotated logo box, in frame px."""
    width = (settings.size_percent / 100.0) * frame_w
    height = width * (logo_h / float(logo_w)) if logo_w else width
    margin = scaled_px(settings.margin, frame_w)

    position = settings.position
    if position == "custom":
        x = (settings.custom_x / 100.0) * frame_w - width / 2.0
        y = (settings.custom_y / 100.0) * frame_h - height / 2.0
    elif position == "center":
        x = (frame_w - width) / 2.0
        y = (frame_h - height) / 2.0
    else:
        vertical, horizontal = position.split("-")
        x = margin if horizontal == "left" else frame_w - width - margin
        y = margin if vertical == "top" else frame_h - height - margin
    return x, y, width, height


def prepare_logo(logo: Image.Image, target_w: int, target_h: int, opacity: float, rotation: float):
    """Resize, fade and rotate the logo ready for compositing."""
    prepared = logo if logo.mode == "RGBA" else logo.convert("RGBA")

    if (target_w, target_h) != prepared.size:
        prepared = prepared.resize(
            (max(1, target_w), max(1, target_h)), Image.Resampling.LANCZOS
        )
    else:
        prepared = prepared.copy()

    if opacity < 100.0:
        alpha = prepared.getchannel("A").point(
            lambda value, factor=opacity / 100.0: int(round(value * factor))
        )
        prepared.putalpha(alpha)

    if abs(rotation) > 1e-6:
        # PIL rotates counter-clockwise for positive angles, CSS clockwise.
        prepared = prepared.rotate(
            -rotation, resample=Image.Resampling.BICUBIC, expand=True
        )

    return prepared


def composite_logo(frame: Image.Image, logo: Image.Image, settings: LogoSettings) -> Image.Image:
    """Draw ``logo`` onto ``frame`` (RGBA, modified in place) and return it."""
    if logo is None or settings.opacity <= 0 or settings.size_percent <= 0:
        return frame

    frame_w, frame_h = frame.size
    x, y, width, height = logo_box(frame_w, frame_h, logo.width, logo.height, settings)
    target_w = max(1, int(round(width)))
    target_h = max(1, int(round(height)))

    prepared = prepare_logo(logo, target_w, target_h, settings.opacity, settings.rotation)

    # Rotation expands the bitmap; keep the original box's centre fixed so the
    # result matches a CSS rotation of the same element.
    centre_x = x + width / 2.0
    centre_y = y + height / 2.0
    paste_x = int(round(centre_x - prepared.width / 2.0))
    paste_y = int(round(centre_y - prepared.height / 2.0))

    return paste_rgba(frame, prepared, paste_x, paste_y)


def paste_rgba(frame: Image.Image, overlay: Image.Image, x: int, y: int) -> Image.Image:
    """Alpha-composite ``overlay`` at ``(x, y)``, clipping to the frame.

    ``Image.alpha_composite`` needs a non-negative destination, so the overlay
    is cropped to the visible region first. Compositing only that region keeps
    memory flat for very large frames.
    """
    frame_w, frame_h = frame.size
    left = max(0, x)
    top = max(0, y)
    right = min(frame_w, x + overlay.width)
    bottom = min(frame_h, y + overlay.height)
    if right <= left or bottom <= top:
        return frame  # entirely outside the frame

    if (left, top, right, bottom) != (x, y, x + overlay.width, y + overlay.height):
        overlay = overlay.crop((left - x, top - y, right - x, bottom - y))

    frame.alpha_composite(overlay, dest=(left, top))
    return frame
