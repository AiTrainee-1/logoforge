"""The rendering engine.

Pipeline (spec section 35/38)::

    original file -> output frame -> scale/offset -> crop to frame
                  -> logo -> character label -> extra elements -> encode

Quality rules that this module exists to enforce:

* "Original" export keeps the source's own pixel dimensions. Nothing is
  resized just because it passed through the app.
* The source is decoded once and encoded once. No intermediate re-compression.
* Only the *visible* part of the source is resampled, and only when the
  effective scale is not exactly 1.0.
* When the render is a true no-op (identity placement, nothing drawn on top,
  same container) the original bytes are copied through untouched.
* Format is preserved: JPEG stays JPEG, PNG stays PNG, WebP stays WebP.
"""
from __future__ import annotations

import io
import math
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageOps

from services.label_service import LabelSettings, composite_label, parse_hex
from services.logo_processor import LogoSettings, composite_logo, paste_rgba
from services.overlay_service import render_elements
from services.transform_service import (
    ExportSettings,
    Transform,
    compute_frame,
    compute_placement,
    is_identity,
)
from utils.errors import ApiError

# Source container -> output container when the user asked for "auto".
FORMAT_MAP = {
    "JPEG": "JPEG",
    "MPO": "JPEG",
    "PNG": "PNG",
    "WEBP": "WEBP",
    "TIFF": "TIFF",
    "BMP": "PNG",     # BMP is huge and rarely wanted back
    "GIF": "PNG",     # compositing cannot keep animation
    "HEIF": "JPEG",   # no reliable HEIC encoder on the server
    "AVIF": "JPEG",
}

EXTENSION = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
    "TIFF": ".tiff",
}

MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "TIFF": "image/tiff",
}

ALPHA_CAPABLE = {"PNG", "WEBP", "TIFF"}


@dataclass
class RenderSpec:
    """Everything needed to render one image."""

    transform: Transform
    logo: LogoSettings
    label: LabelSettings
    export: ExportSettings
    label_text: str = ""
    logo_image: Image.Image | None = None
    # Free-position extra text / stamps, drawn last. Per image, never shared.
    overlays: list = field(default_factory=list)
    # Assets an image overlay can reference, keyed by id.
    assets: dict = field(default_factory=dict)


@dataclass
class RenderResult:
    data: bytes
    width: int
    height: int
    image_format: str
    extension: str
    mime: str
    passthrough: bool
    resampled: bool
    notes: list


def open_source(path: Path) -> Image.Image:
    """Open an image and apply its EXIF orientation once, up front."""
    try:
        img = Image.open(path)
        img.load()
    except Exception as exc:  # noqa: BLE001
        raise ApiError(
            "IMAGE_PROCESSING_FAILED", "Unable to read this image.", 422
        ) from exc
    try:
        oriented = ImageOps.exif_transpose(img)
        if oriented is not img:
            img.close()
            img = oriented
    except Exception:  # pragma: no cover - broken EXIF is not fatal
        pass
    return img


def target_format(source_format: str, export: ExportSettings) -> str:
    if export.output_format != "auto":
        return export.output_format.upper()
    return FORMAT_MAP.get((source_format or "").upper(), "PNG")


def draw_source(canvas: Image.Image, source: Image.Image, placement) -> Image.Image:
    """Place ``source`` into ``canvas`` following ``placement``.

    Only the region that actually lands inside the frame is cropped and
    resampled, which keeps memory flat and avoids building a giant scaled
    bitmap just to throw most of it away.
    """
    frame_w, frame_h = canvas.size
    eff = placement.scale
    if eff <= 0:
        return canvas

    vis_x0 = max(0.0, placement.x)
    vis_y0 = max(0.0, placement.y)
    vis_x1 = min(float(frame_w), placement.x + placement.width)
    vis_y1 = min(float(frame_h), placement.y + placement.height)
    if vis_x1 <= vis_x0 or vis_y1 <= vis_y0:
        return canvas  # the image sits entirely outside the frame

    src_x0 = (vis_x0 - placement.x) / eff
    src_y0 = (vis_y0 - placement.y) / eff
    src_x1 = (vis_x1 - placement.x) / eff
    src_y1 = (vis_y1 - placement.y) / eff

    crop_x0 = max(0, int(math.floor(src_x0)))
    crop_y0 = max(0, int(math.floor(src_y0)))
    crop_x1 = min(source.width, int(math.ceil(src_x1)))
    crop_y1 = min(source.height, int(math.ceil(src_y1)))
    if crop_x1 <= crop_x0 or crop_y1 <= crop_y0:
        return canvas

    region = source.crop((crop_x0, crop_y0, crop_x1, crop_y1))
    target_w = max(1, int(round((crop_x1 - crop_x0) * eff)))
    target_h = max(1, int(round((crop_y1 - crop_y0) * eff)))
    if (target_w, target_h) != region.size:
        # Single, high quality resampling pass - the only one in the pipeline.
        region = region.resize((target_w, target_h), Image.Resampling.LANCZOS)

    paste_x = int(round(placement.x + crop_x0 * eff))
    paste_y = int(round(placement.y + crop_y0 * eff))
    if region.mode != "RGBA":
        region = region.convert("RGBA")
    return paste_rgba(canvas, region, paste_x, paste_y)


def encode(image: Image.Image, image_format: str, export: ExportSettings, info: dict) -> bytes:
    """Encode once, at the highest practical quality for the container."""
    buffer = io.BytesIO()
    params = {}

    icc = info.get("icc_profile")
    if icc:
        params["icc_profile"] = icc
    exif = info.get("exif")
    dpi = info.get("dpi")

    if image_format == "JPEG":
        if image.mode != "RGB":
            image = flatten(image, export)
        params.update(
            quality=int(export.quality),
            subsampling=0,          # 4:4:4 - no chroma loss
            optimize=True,
            progressive=True,
        )
        if export.quality >= 100:
            params["quality"] = 100
        if exif:
            params["exif"] = exif
        if dpi:
            params["dpi"] = dpi
    elif image_format == "PNG":
        if image.mode == "RGBA" and not has_alpha_pixels(image):
            image = image.convert("RGB")
        params.update(optimize=False, compress_level=6)  # always lossless
        if dpi:
            params["dpi"] = dpi
    elif image_format == "WEBP":
        params.update(method=6, exact=True)
        if export.quality >= 100:
            params.update(lossless=True, quality=100)
        else:
            params.update(quality=int(export.quality))
        if exif:
            params["exif"] = exif
    elif image_format == "TIFF":
        if image.mode == "RGBA" and not has_alpha_pixels(image):
            image = image.convert("RGB")
        params.update(compression="tiff_lzw")  # lossless
        if dpi:
            params["dpi"] = dpi
    else:  # pragma: no cover - guarded by target_format()
        raise ApiError("UNSUPPORTED_FORMAT", "Unsupported output format.", 415)

    try:
        image.save(buffer, format=image_format, **params)
    except Exception as exc:  # noqa: BLE001
        raise ApiError(
            "IMAGE_PROCESSING_FAILED", "Unable to encode the processed image.", 422
        ) from exc
    return buffer.getvalue()


def has_alpha_pixels(image: Image.Image) -> bool:
    if "A" not in image.getbands():
        return False
    extrema = image.getchannel("A").getextrema()
    return extrema[0] < 255


def flatten(image: Image.Image, export: ExportSettings) -> Image.Image:
    """Drop transparency onto the configured background (JPEG only)."""
    if image.mode == "RGB":
        return image
    background = Image.new("RGB", image.size, parse_hex(export.background, (255, 255, 255)))
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    background.paste(image, (0, 0), image)
    return background


def render(source_path: Path, spec: RenderSpec, source_meta: dict) -> RenderResult:
    """Render one image end to end and return the encoded bytes."""
    notes = []
    source_format = (source_meta.get("format") or "").upper()
    out_format = target_format(source_format, spec.export)
    if out_format not in EXTENSION:
        out_format = "PNG"
    if source_format and FORMAT_MAP.get(source_format, out_format) != source_format and (
        spec.export.output_format == "auto"
    ):
        notes.append(
            "%s cannot be written back losslessly, saved as %s instead."
            % (source_format, out_format)
        )

    with open_source(source_path) as source:
        src_w, src_h = source.size
        frame_w, frame_h = compute_frame(src_w, src_h, spec.export)
        placement = compute_placement(
            src_w, src_h, frame_w, frame_h, spec.transform, spec.export.fit
        )
        identity = is_identity(placement, frame_w, frame_h, src_w, src_h)
        draws_logo = (
            spec.logo_image is not None and spec.logo is not None and spec.logo.opacity > 0
        )
        draws_label = bool(spec.label.enabled and spec.label_text)
        draws_overlays = bool(spec.overlays)

        # True no-op: hand back the original bytes, bit for bit.
        if (
            identity
            and not draws_logo
            and not draws_label
            and not draws_overlays
            and out_format == source_format
            and spec.export.format == "original"
        ):
            return RenderResult(
                data=source_path.read_bytes(),
                width=src_w,
                height=src_h,
                image_format=out_format,
                extension=EXTENSION[out_format],
                mime=MIME[out_format],
                passthrough=True,
                resampled=False,
                notes=notes + ["Original file copied unchanged."],
            )

        info = dict(source.info)
        wants_alpha = (
            out_format in ALPHA_CAPABLE
            and spec.export.keep_transparency
            and (source.mode in ("RGBA", "LA", "PA") or "transparency" in source.info)
        )
        background = (
            (0, 0, 0, 0)
            if wants_alpha
            else parse_hex(spec.export.background, (255, 255, 255)) + (255,)
        )
        canvas = Image.new("RGBA", (frame_w, frame_h), background)

        rgba_source = source if source.mode == "RGBA" else source.convert("RGBA")
        canvas = draw_source(canvas, rgba_source, placement)
        if rgba_source is not source:
            rgba_source.close()

    resampled = abs(placement.scale - 1.0) > 1e-9

    if draws_logo:
        canvas = composite_logo(canvas, spec.logo_image, spec.logo)
    if draws_label:
        canvas = composite_label(canvas, spec.label_text, spec.label)
    if draws_overlays:
        canvas = render_elements(canvas, spec.overlays, spec.assets)

    if not wants_alpha and out_format != "JPEG":
        canvas = canvas.convert("RGB")

    data = encode(canvas, out_format, spec.export, info)
    canvas.close()

    return RenderResult(
        data=data,
        width=frame_w,
        height=frame_h,
        image_format=out_format,
        extension=EXTENSION[out_format],
        mime=MIME[out_format],
        passthrough=False,
        resampled=resampled,
        notes=notes,
    )
