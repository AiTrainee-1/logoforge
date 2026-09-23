"""Upload validation: extensions, real format, size and decompression bombs."""
from __future__ import annotations

import io
import re
from pathlib import Path

from PIL import Image, ImageFile, UnidentifiedImageError

from config import config
from utils import codecs
from utils.errors import ApiError
from utils.filenames import sanitize_filename, split_ext

# Refuse a broken file rather than silently decoding a truncated one.
ImageFile.LOAD_TRUNCATED_IMAGES = False
# Pillow's own bomb guard, aligned with our configured budget.
Image.MAX_IMAGE_PIXELS = config.MAX_IMAGE_PIXELS

ID_RE = re.compile(r"^[a-f0-9]{8,32}$")

# Pillow format name -> MIME type for the formats we accept.
MIME_BY_FORMAT = {
    "JPEG": "image/jpeg",
    "MPO": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "GIF": "image/gif",
    "BMP": "image/bmp",
    "TIFF": "image/tiff",
    "HEIF": "image/heic",
    "AVIF": "image/avif",
}


def safe_id(value: str) -> str:
    """Validate an identifier before it is used to build a filesystem path."""
    if not value or not ID_RE.match(value):
        raise ApiError("INVALID_ID", "That identifier is not valid.", 400)
    return value


def safe_job_dir(root: Path, job_id: str) -> Path:
    """Resolve ``root/job_id`` while refusing anything that escapes ``root``."""
    resolved_root = root.resolve()
    job_dir = (resolved_root / safe_id(job_id)).resolve()
    if job_dir.parent != resolved_root:
        raise ApiError("INVALID_ID", "That identifier is not valid.", 400)
    return job_dir


def supported_extensions(allowed: set) -> set:
    """The configured set minus anything this deployment lacks a codec for."""
    return set(allowed) - codecs.unavailable_extensions()


def check_extension(filename: str, allowed: set) -> str:
    _, ext = split_ext(sanitize_filename(filename))
    allowed = supported_extensions(allowed)
    if ext in codecs.unavailable_extensions():
        raise ApiError(
            "CODEC_UNAVAILABLE",
            "'%s' files need an optional codec that this server does not have "
            "installed. Convert the file to JPEG or PNG first." % ext.lstrip("."),
            415,
        )
    if ext not in allowed:
        supported = ", ".join(sorted(e.lstrip(".") for e in allowed))
        raise ApiError(
            "UNSUPPORTED_FORMAT",
            "'%s' files are not supported. Supported: %s."
            % (ext.lstrip(".") or "unknown", supported),
            415,
        )
    return ext


def check_size(data: bytes, filename: str) -> None:
    limit = config.max_file_size_bytes()
    if len(data) == 0:
        raise ApiError("EMPTY_FILE", "'%s' is empty." % filename, 400)
    if len(data) > limit:
        raise ApiError(
            "FILE_TOO_LARGE",
            "'%s' is %.1f MB which is over the %d MB limit."
            % (filename, len(data) / 1024 / 1024, config.MAX_FILE_SIZE_MB),
            413,
        )


def inspect_image(data: bytes, filename: str) -> dict:
    """Decode headers only and return trustworthy metadata.

    The *actual* bytes decide the format, never the client supplied name or
    MIME type.
    """
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()  # structural check; consumes the file object
        with Image.open(io.BytesIO(data)) as img:
            fmt = (img.format or "").upper()
            width, height = img.size
            mode = img.mode
            animated = getattr(img, "n_frames", 1) > 1
            has_alpha = mode in ("RGBA", "LA", "PA") or "transparency" in img.info
    except Exception as exc:  # noqa: BLE001 - everything here is a bad upload
        message = str(exc).lower()
        if isinstance(exc, Image.DecompressionBombError) or "exceeds limit" in message:
            raise ApiError(
                "IMAGE_TOO_LARGE",
                "'%s' has too many pixels to process safely." % filename,
                413,
            ) from exc
        if isinstance(exc, (UnidentifiedImageError, SyntaxError, OSError, ValueError)):
            raise ApiError(
                "INVALID_IMAGE",
                "'%s' could not be read as an image. It may be corrupted." % filename,
                400,
            ) from exc
        raise

    if width <= 0 or height <= 0:
        raise ApiError("INVALID_IMAGE", "'%s' has no usable dimensions." % filename, 400)
    if width * height > config.MAX_IMAGE_PIXELS:
        raise ApiError(
            "IMAGE_TOO_LARGE",
            "'%s' is %dx%d which is above the safe processing limit."
            % (filename, width, height),
            413,
        )

    return {
        "format": fmt,
        "mime": MIME_BY_FORMAT.get(fmt, "application/octet-stream"),
        "width": width,
        "height": height,
        "mode": mode,
        "animated": bool(animated),
        "hasAlpha": bool(has_alpha),
        "size": len(data),
    }
