"""ZIP packaging.

The archive contains the *already rendered* files, byte for byte identical to
what an individual download returns. Nothing is resized, converted or
re-encoded on the way in, and ZIP_STORED is used because the payload is
already-compressed image data.
"""
from __future__ import annotations

import zipfile
from pathlib import Path

from PIL import Image

from services import job_store
from utils.errors import ApiError
from utils.filenames import unique_name

ZIP_NAME = "logo-forge.zip"


def validate_output(path: Path, entry: dict) -> None:
    """Final gate before packaging: the file must exist and decode cleanly."""
    if not path.is_file() or path.stat().st_size == 0:
        raise ApiError(
            "INVALID_OUTPUT",
            "'%s' is missing or empty. Please process the images again."
            % (entry.get("filename") or entry.get("sourceName") or "output"),
            422,
        )
    try:
        with Image.open(path) as img:
            img.verify()
        with Image.open(path) as img:
            width, height = img.size
    except Exception as exc:  # noqa: BLE001
        raise ApiError(
            "INVALID_OUTPUT",
            "'%s' could not be verified. Please process the images again."
            % (entry.get("filename") or "output"),
            422,
        ) from exc
    if width <= 0 or height <= 0:
        raise ApiError("INVALID_OUTPUT", "A processed file has no dimensions.", 422)


def build_zip(job_id: str) -> Path:
    """Package every completed result and return the archive path."""
    results = job_store.completed_results(job_id)
    if not results:
        raise ApiError(
            "NOTHING_TO_DOWNLOAD",
            "There are no processed images to download yet.",
            409,
        )

    base = job_store.job_dir(job_id)
    archive = base / ZIP_NAME
    temp = base / (ZIP_NAME + ".tmp")

    taken: set = set()
    ordered = sorted(results, key=lambda entry: entry.get("index", 0))

    try:
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_STORED) as bundle:
            for entry in ordered:
                path = base / "output" / entry["storedName"]
                validate_output(path, entry)
                name = unique_name(entry["filename"], taken)
                # write() copies the bytes verbatim - no image code involved.
                bundle.write(path, arcname=name)
    except ApiError:
        temp.unlink(missing_ok=True)
        raise
    except OSError as exc:
        temp.unlink(missing_ok=True)
        raise ApiError(
            "ZIP_FAILED", "The ZIP file could not be created. Please try again.", 500
        ) from exc

    temp.replace(archive)
    return archive
