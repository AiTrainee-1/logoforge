"""Health and capability endpoints."""
from __future__ import annotations

from flask import Blueprint, jsonify

from config import config
from services.compose_service import CARD_PRESETS
from services.transform_service import EXPORT_PRESETS, REFERENCE_WIDTH
from utils.fonts import bundled_font_file, font_family_name
from utils.validation import supported_extensions

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    return jsonify({"status": "ok", "service": config.SERVICE_NAME})


@bp.get("/capabilities")
def capabilities():
    """What the client is allowed to send, and the shared render constants."""
    return jsonify(
        {
            "success": True,
            "service": config.SERVICE_NAME,
            "limits": {
                "maxFileSizeMb": config.MAX_FILE_SIZE_MB,
                "maxImages": config.MAX_IMAGES,
                "maxImagePixels": config.MAX_IMAGE_PIXELS,
            },
            "accept": {
                "images": sorted(supported_extensions(config.ALLOWED_EXTENSIONS)),
                "logo": sorted(supported_extensions(config.ALLOWED_LOGO_EXTENSIONS)),
            },
            "exportPresets": {
                key: ({"width": value[0], "height": value[1]} if value else None)
                for key, value in EXPORT_PRESETS.items()
            },
            "cardPresets": CARD_PRESETS,
            "referenceWidth": REFERENCE_WIDTH,
            "labelFont": font_family_name(True),
            # Present only when a font was deliberately bundled; the preview
            # then renders with the exact face the export uses.
            "fontUrls": bundled_font_file(),
            # Named families a text element can opt into via `fontFamily`.
            # "default" duplicates labelFont/fontUrls above for convenience;
            # "serif" is the Catalog Composer's editorial face.
            "fonts": {
                "default": {"label": font_family_name(True, "default"), "urls": bundled_font_file("default")},
                "serif": {"label": font_family_name(True, "serif"), "urls": bundled_font_file("serif")},
            },
        }
    )
