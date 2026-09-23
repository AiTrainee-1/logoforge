"""Application configuration.

Everything that differs between local development and production is read from
the environment so that no deployment-specific value is hard-coded.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

try:  # Local development convenience; Railway injects real env vars.
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except Exception:  # noqa: BLE001 - python-dotenv is optional
    pass


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_list(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


class Config:
    """Runtime configuration for the LogoForge API."""

    SERVICE_NAME = "logoforge-api"

    # --- Networking -----------------------------------------------------
    PORT = _env_int("PORT", 5000)
    # Comma separated list. The first entry is what a browser normally uses.
    FRONTEND_URL = _env_list("FRONTEND_URL", "http://localhost:5173,http://127.0.0.1:5173")

    # --- Limits ---------------------------------------------------------
    MAX_FILE_SIZE_MB = _env_int("MAX_FILE_SIZE_MB", 25)
    MAX_IMAGES = _env_int("MAX_IMAGES", 100)
    # Guard against decompression bombs: refuse anything above this pixel count.
    MAX_IMAGE_PIXELS = _env_int("MAX_IMAGE_PIXELS", 120_000_000)  # ~120 MP
    # Whole-request cap (images + logo + multipart overhead).
    MAX_CONTENT_LENGTH = _env_int("MAX_CONTENT_LENGTH_MB", 512) * 1024 * 1024

    # --- Processing -----------------------------------------------------
    # Number of images rendered in parallel. Kept low on purpose: full
    # resolution images are memory hungry.
    WORKERS = max(1, _env_int("PROCESSING_WORKERS", 4))

    # --- Storage --------------------------------------------------------
    TEMP_DIR = Path(os.getenv("TEMP_DIR") or (Path(tempfile.gettempdir()) / "logoforge"))
    # Jobs older than this are deleted by the janitor thread.
    JOB_TTL_SECONDS = _env_int("JOB_TTL_SECONDS", 2 * 60 * 60)
    CLEANUP_INTERVAL_SECONDS = _env_int("CLEANUP_INTERVAL_SECONDS", 10 * 60)

    ALLOWED_EXTENSIONS = {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff",
        ".heic", ".heif", ".avif",
    }
    ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}

    @classmethod
    def max_file_size_bytes(cls) -> int:
        return cls.MAX_FILE_SIZE_MB * 1024 * 1024


config = Config()
