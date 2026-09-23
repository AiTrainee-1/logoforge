"""Serve the label font so the preview can use the very same glyphs.

Only files the deployer deliberately placed in ``assets/fonts`` are served -
never a font picked up from the operating system, which would mean
redistributing someone else's licensed typeface.
"""
from __future__ import annotations

import re

from flask import Blueprint, send_file

from utils.errors import ApiError
from utils.fonts import ASSET_DIR

bp = Blueprint("fonts", __name__)

NAME_RE = re.compile(r"^[A-Za-z0-9_-]+\.(ttf|otf|woff2?)$")
MIME = {
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


@bp.get("/fonts/<path:filename>")
def font(filename: str):
    if not NAME_RE.match(filename or ""):
        raise ApiError("NOT_FOUND", "That font is not available.", 404)

    path = (ASSET_DIR / filename).resolve()
    if path.parent != ASSET_DIR.resolve() or not path.is_file():
        raise ApiError("NOT_FOUND", "That font is not available.", 404)

    response = send_file(path, mimetype=MIME.get(path.suffix.lower(), "font/ttf"))
    response.headers["Cache-Control"] = "public, max-age=86400"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response
