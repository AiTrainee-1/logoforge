"""Single-canvas composer.

Two canvas modes, one renderer:

``image``
    The canvas **is** the uploaded photo, at its own pixel dimensions. Nothing
    is scaled, so the export comes back at the original resolution - and if no
    element has been added the original bytes are copied through byte for byte.

``card``
    The canvas is a fixed page (A4 at 150 or 300 dpi, a square, a story...) with
    a background colour. The photo is then just another element that can be
    moved and resized like the text and the logos.

Elements are the same ``OverlayElement`` used by the batch editor, so the
geometry, the preview and this renderer all agree.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass

from PIL import Image

from services import job_store
from services.image_processor import (
    ALPHA_CAPABLE,
    EXTENSION,
    FORMAT_MAP,
    MIME,
    encode,
    open_source,
)
from services.overlay_service import parse_elements, render_elements
from services.text_service import parse_hex
from services.transform_service import ExportSettings, as_optional_int
from utils.errors import ApiError
from utils.filenames import sanitize_filename, split_ext

CARD_PRESETS = {
    "a4-150": {"width": 1240, "height": 1754, "label": "A4 page (150 dpi)"},
    "a4-300": {"width": 2480, "height": 3508, "label": "A4 page (300 dpi)"},
    "square-1080": {"width": 1080, "height": 1080, "label": "Square 1080"},
    "square-2048": {"width": 2048, "height": 2048, "label": "Square 2048"},
    "portrait-1080": {"width": 1080, "height": 1350, "label": "Portrait 4:5"},
    "story-1080": {"width": 1080, "height": 1920, "label": "Story 9:16"},
    "catalog": {"width": 925, "height": 1131, "label": "Catalog card (925x1131)"},
}

MAX_SIDE = 10000
MAX_PIXELS = 60_000_000
COMPOSE_DIR = "compose"


@dataclass
class Composition:
    data: bytes
    width: int
    height: int
    image_format: str
    extension: str
    mime: str
    passthrough: bool
    filename: str


def find_image(job_id: str, image_id: str):
    meta = job_store.read_meta(job_id)
    for record in meta.get("images", []):
        if record["id"] == image_id:
            return record
    return None


def resolve_frame(payload: dict, base_record) -> tuple:
    """Return ``(width, height)`` for the canvas."""
    mode = str(payload.get("mode") or "image").lower()
    if mode == "image":
        if base_record is None:
            raise ApiError(
                "NO_BASE_IMAGE", "Upload an image before exporting this canvas.", 400
            )
        return int(base_record["width"]), int(base_record["height"])

    preset = str(payload.get("preset") or "a4-150").lower()
    if preset in CARD_PRESETS:
        entry = CARD_PRESETS[preset]
        return entry["width"], entry["height"]

    width = as_optional_int(payload.get("width"))
    height = as_optional_int(payload.get("height"))
    if not width or not height:
        raise ApiError("INVALID_CANVAS", "The canvas needs a width and a height.", 400)
    if width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise ApiError(
            "CANVAS_TOO_LARGE",
            "That canvas is too large. Keep each side under %d px." % MAX_SIDE,
            400,
        )
    return width, height


def load_assets(job_id: str, elements: list) -> dict:
    """Open every image an element references, once each."""
    wanted = {
        element.asset_id
        for element in elements
        if element.type == "image" and element.asset_id
    }
    assets = {}
    for asset_id in wanted:
        record = find_image(job_id, asset_id)
        if record is None:
            continue
        try:
            image, _reoriented = open_source(job_store.source_path(job_id, record))
            assets[asset_id] = image.convert("RGBA") if image.mode != "RGBA" else image
        except ApiError:
            continue
    return assets


def output_format(payload: dict, base_record) -> str:
    requested = str((payload.get("export") or {}).get("outputFormat") or "auto").lower()
    if requested in ("jpeg", "png", "webp", "tiff"):
        return requested.upper()
    mode = str(payload.get("mode") or "image").lower()
    if mode == "image" and base_record:
        return FORMAT_MAP.get((base_record.get("format") or "").upper(), "PNG")
    # A card has transparency and flat colour: PNG keeps both, losslessly.
    return "PNG"


def render_composition(job_id: str, payload: dict) -> Composition:
    payload = payload or {}
    mode = str(payload.get("mode") or "image").lower()
    if mode not in ("image", "card"):
        mode = "image"

    base_record = None
    base_id = payload.get("baseImageId")
    if mode == "image":
        if not base_id:
            raise ApiError(
                "NO_BASE_IMAGE", "Upload an image before exporting this canvas.", 400
            )
        base_record = find_image(job_id, str(base_id))
        if base_record is None:
            raise ApiError("IMAGE_NOT_FOUND", "That image is not in this session.", 404)

    elements = parse_elements(payload.get("elements"))
    frame_w, frame_h = resolve_frame(payload, base_record)
    export = ExportSettings.from_payload(payload.get("export"))
    image_format = output_format(payload, base_record)
    if image_format not in EXTENSION:
        image_format = "PNG"

    transparent = bool(payload.get("transparent")) and image_format in ALPHA_CAPABLE
    background = parse_hex(payload.get("background"), (255, 255, 255))

    info = {}
    if mode == "image":
        source_file = job_store.source_path(job_id, base_record)
        source, reoriented = open_source(source_file)
        try:
            info = dict(source.info)
            # Trust the pixels over the stored metadata.
            frame_w, frame_h = source.size

            if (
                not elements
                and not reoriented
                and image_format == (base_record.get("format") or "").upper()
            ):
                # Nothing to draw: hand back the original file untouched.
                return Composition(
                    data=source_file.read_bytes(),
                    width=frame_w,
                    height=frame_h,
                    image_format=image_format,
                    extension=EXTENSION[image_format],
                    mime=MIME[image_format],
                    passthrough=True,
                    filename=composed_name(
                        base_record.get("name"), EXTENSION[image_format]
                    ),
                )

            # The canvas is the photo itself - never resampled, never resized.
            canvas = source.convert("RGBA") if source.mode != "RGBA" else source.copy()
        finally:
            source.close()
    else:
        fill = (0, 0, 0, 0) if transparent else background + (255,)
        canvas = Image.new("RGBA", (frame_w, frame_h), fill)

    assets = load_assets(job_id, elements)
    try:
        canvas = render_elements(canvas, elements, assets)
    finally:
        for asset in assets.values():
            asset.close()

    if not transparent and image_format != "JPEG":
        canvas = canvas.convert("RGB")

    data = encode(canvas, image_format, export, info)
    canvas.close()

    if mode == "image" and base_record:
        filename = composed_name(base_record.get("name"), EXTENSION[image_format])
    else:
        filename = card_name(payload.get("name"), EXTENSION[image_format])

    return Composition(
        data=data,
        width=frame_w,
        height=frame_h,
        image_format=image_format,
        extension=EXTENSION[image_format],
        mime=MIME[image_format],
        passthrough=False,
        filename=filename,
    )


def composed_name(original, extension: str) -> str:
    stem, _ = split_ext(sanitize_filename(original or "image"))
    if not stem.endswith("_composed"):
        stem += "_composed"
    return stem + extension


def card_name(requested, extension: str) -> str:
    stem, _ = split_ext(sanitize_filename(requested or ""))
    if not stem:
        stem = "logoforge-card-%d" % int(time.time())
    return stem + extension


def store_composition(job_id: str, composition: Composition):
    """Write the render so it can be downloaded, and return its path."""
    base = job_store.job_dir(job_id)
    folder = base / COMPOSE_DIR
    folder.mkdir(parents=True, exist_ok=True)
    for stale in folder.glob("composition.*"):
        try:
            stale.unlink()
        except OSError:  # pragma: no cover
            pass
    path = folder / ("composition" + composition.extension)
    path.write_bytes(composition.data)
    (folder / "meta.json").write_text(
        json.dumps(
            {
                "filename": composition.filename,
                "mime": composition.mime,
                "stored": path.name,
            }
        ),
        encoding="utf-8",
    )
    return path


def stored_composition(job_id: str):
    """Return ``(path, meta)`` for the last render, or raise."""
    folder = job_store.job_dir(job_id) / COMPOSE_DIR
    meta_path = folder / "meta.json"
    if not meta_path.is_file():
        raise ApiError("NOTHING_TO_DOWNLOAD", "Export the canvas first.", 409)
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise ApiError("NOTHING_TO_DOWNLOAD", "Export the canvas first.", 409) from exc
    path = folder / str(meta.get("stored") or "")
    if not path.is_file() or path.parent != folder:
        raise ApiError("NOTHING_TO_DOWNLOAD", "Export the canvas first.", 409)
    return path, meta
