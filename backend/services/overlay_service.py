"""Free-position overlay elements: extra text ("extra letters") and stamps.

An element is anchored by its **centre**, expressed as a percentage of the
frame, and rotates about that centre - the same thing
``transform: translate(-50%, -50%) rotate(Ndeg)`` does in the browser preview.
Because the anchor is a percentage, one element description is valid for a
480 px preview and a 4000 px export alike.

Elements are drawn last, on top of the photo, the logo and the character label.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from PIL import Image

from services.logo_processor import paste_rgba
from services.text_service import TextStyle, clean_text, render_text_block, render_text_box
from services.transform_service import as_float, clamp

ELEMENT_TYPES = ("text", "image")
MAX_ELEMENTS = 60


@dataclass
class OverlayElement:
    """One positioned element. Belongs to exactly one image."""

    id: str = ""
    type: str = "text"
    x: float = 50.0       # centre, percent of frame width
    y: float = 50.0       # centre, percent of frame height
    rotation: float = 0.0
    opacity: float = 100.0

    # text elements
    text: str = ""
    style: TextStyle = field(default_factory=TextStyle)
    # A text box (catalog text): explicit width, word-wrapped. 0 means "not a
    # box" - the element keeps the free-floating, auto-sized behaviour every
    # existing caller (Studio's extra letters, composer stamps) already relies
    # on. box_height is a target only; the tile grows taller when the wrapped
    # content needs more room, so text is never clipped.
    box_width: float = 0.0
    box_height: float = 0.0

    # image elements
    asset_id: str = ""
    width_percent: float = 20.0

    @classmethod
    def from_payload(cls, data) -> "OverlayElement":
        data = data or {}
        kind = str(data.get("type") or "text").lower()
        if kind not in ELEMENT_TYPES:
            kind = "text"
        return cls(
            id=str(data.get("id") or "")[:64],
            type=kind,
            x=clamp(as_float(data.get("x"), 50.0), -50.0, 150.0),
            y=clamp(as_float(data.get("y"), 50.0), -50.0, 150.0),
            rotation=clamp(as_float(data.get("rotation"), 0.0), -180.0, 180.0),
            opacity=clamp(as_float(data.get("opacity"), 100.0), 0.0, 100.0),
            text=clean_text(data.get("text")),
            style=TextStyle.from_payload(data),
            box_width=clamp(as_float(data.get("boxWidth"), 0.0), 0.0, 200.0),
            box_height=clamp(as_float(data.get("boxHeight"), 0.0), 0.0, 400.0),
            asset_id=str(data.get("assetId") or "")[:64],
            width_percent=clamp(as_float(data.get("widthPercent"), 20.0), 0.5, 400.0),
        )


def parse_elements(payload) -> list:
    """Turn a client list into validated elements, preserving z-order."""
    if not isinstance(payload, list):
        return []
    return [OverlayElement.from_payload(item) for item in payload[:MAX_ELEMENTS]]


def prepare_image_element(asset: Image.Image, element: OverlayElement, frame_w: int):
    """Resize, fade and rotate an image element ready for compositing."""
    target_w = max(1, int(round((element.width_percent / 100.0) * frame_w)))
    ratio = asset.height / float(asset.width) if asset.width else 1.0
    target_h = max(1, int(round(target_w * ratio)))

    prepared = asset if asset.mode == "RGBA" else asset.convert("RGBA")
    if (target_w, target_h) != prepared.size:
        prepared = prepared.resize((target_w, target_h), Image.Resampling.LANCZOS)
    else:
        prepared = prepared.copy()

    if element.opacity < 100.0:
        alpha = prepared.getchannel("A").point(
            lambda value, factor=element.opacity / 100.0: int(round(value * factor))
        )
        prepared.putalpha(alpha)
    return prepared


def render_element(frame: Image.Image, element: OverlayElement, assets: dict) -> Image.Image:
    """Draw one element onto ``frame`` (RGBA) and return it."""
    frame_w, frame_h = frame.size
    if element.opacity <= 0:
        return frame

    if element.type == "text":
        if not element.text:
            return frame
        if element.box_width > 0:
            box_width_px = (element.box_width / 100.0) * frame_w
            box_height_px = (element.box_height / 100.0) * frame_h
            tile, _ = render_text_box(
                element.text, frame_w, element.style, box_width_px, box_height_px, element.opacity
            )
        else:
            tile, _ = render_text_block(element.text, frame_w, element.style, element.opacity)
    else:
        asset = assets.get(element.asset_id)
        if asset is None:
            return frame  # a stamp whose asset went away is simply skipped
        tile = prepare_image_element(asset, element, frame_w)

    if abs(element.rotation) > 1e-6:
        # PIL rotates counter-clockwise for positive angles, CSS clockwise.
        tile = tile.rotate(-element.rotation, resample=Image.Resampling.BICUBIC, expand=True)

    centre_x = (element.x / 100.0) * frame_w
    centre_y = (element.y / 100.0) * frame_h
    x = int(round(centre_x - tile.width / 2.0))
    y = int(round(centre_y - tile.height / 2.0))
    return paste_rgba(frame, tile, x, y)


def render_elements(frame: Image.Image, elements: list, assets: dict) -> Image.Image:
    """Draw every element in order - later elements sit on top."""
    for element in elements or []:
        frame = render_element(frame, element, assets)
    return frame
