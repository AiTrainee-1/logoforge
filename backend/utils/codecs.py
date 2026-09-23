"""Optional codec plugins.

HEIC/HEIF and AVIF need a plugin that is not always installable (it ships
platform wheels). They are therefore advertised only when the plugin is
actually present, and a clear message is returned otherwise instead of a
confusing "corrupted file" error.
"""
from __future__ import annotations

import logging

log = logging.getLogger("logoforge")

HEIF_AVAILABLE = False
AVIF_AVAILABLE = False

try:  # pragma: no cover - depends on the deployment image
    import pillow_heif  # type: ignore

    pillow_heif.register_heif_opener()
    HEIF_AVAILABLE = True
    try:
        pillow_heif.register_avif_opener()
        AVIF_AVAILABLE = True
    except AttributeError:
        AVIF_AVAILABLE = False
except Exception:  # noqa: BLE001 - plugin simply not installed
    log.info("pillow-heif not available: HEIC/HEIF uploads are disabled")

if not AVIF_AVAILABLE:  # pragma: no cover
    try:
        import pillow_avif  # type: ignore # noqa: F401

        AVIF_AVAILABLE = True
    except Exception:  # noqa: BLE001
        pass

HEIF_EXTENSIONS = {".heic", ".heif"}
AVIF_EXTENSIONS = {".avif"}


def unavailable_extensions() -> set:
    missing = set()
    if not HEIF_AVAILABLE:
        missing |= HEIF_EXTENSIONS
    if not AVIF_AVAILABLE:
        missing |= AVIF_EXTENSIONS
    return missing
