"""Job storage and batch orchestration.

A job is one editing session: its uploaded originals, its logo and its rendered
output all live in a single throw-away directory::

    <TEMP_DIR>/<job-id>/
        meta.json      uploaded originals + logo metadata
        status.json    processing progress and per-image results
        source/        the untouched uploaded files
        logo/          the uploaded logo
        output/        rendered files (also what the ZIP packages)

Nothing is stored anywhere else and the janitor deletes the whole directory
once the job's TTL expires.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from pathlib import Path

from PIL import Image

from config import config
from services.image_processor import RenderSpec, render
from services.label_service import LabelSettings
from services.logo_processor import LogoSettings
from services.overlay_service import parse_elements
from services.transform_service import ExportSettings, Transform
from utils.cleanup import remove_tree
from utils.errors import ApiError
from utils.filenames import alphabetic_label, branded_name, sanitize_filename, split_ext
from utils.validation import (
    check_extension,
    check_size,
    inspect_image,
    safe_id,
    safe_job_dir,
)

log = logging.getLogger("logoforge")

_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()
_EXECUTOR = ThreadPoolExecutor(
    max_workers=config.WORKERS, thread_name_prefix="logoforge-render"
)


def _lock_for(job_id: str) -> threading.Lock:
    with _LOCKS_GUARD:
        lock = _LOCKS.get(job_id)
        if lock is None:
            lock = threading.Lock()
            _LOCKS[job_id] = lock
        return lock


def root_dir() -> Path:
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    return config.TEMP_DIR


def job_dir(job_id: str) -> Path:
    path = safe_job_dir(root_dir(), job_id)
    if not path.is_dir():
        raise ApiError(
            "JOB_NOT_FOUND",
            "This editing session has expired. Please upload your images again.",
            404,
        )
    return path


def _write_json(path: Path, payload: dict) -> None:
    """Write atomically so a reader never sees a half-written file."""
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload), encoding="utf-8")
    os.replace(temp, path)


def _read_json(path: Path, fallback: dict) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return dict(fallback)


# --------------------------------------------------------------------------
# Job lifecycle
# --------------------------------------------------------------------------

def create_job() -> str:
    job_id = uuid.uuid4().hex
    base = root_dir() / job_id
    (base / "source").mkdir(parents=True, exist_ok=True)
    (base / "logo").mkdir(parents=True, exist_ok=True)
    (base / "output").mkdir(parents=True, exist_ok=True)
    _write_json(
        base / "meta.json",
        {"id": job_id, "createdAt": time.time(), "images": [], "logo": None},
    )
    _write_json(base / "status.json", _idle_status())
    return job_id


def _idle_status() -> dict:
    return {
        "status": "idle",
        "total": 0,
        "completed": 0,
        "failed": 0,
        "progress": 0,
        "results": [],
        "startedAt": None,
        "finishedAt": None,
    }


def read_meta(job_id: str) -> dict:
    base = job_dir(job_id)
    return _read_json(base / "meta.json", {"id": job_id, "images": [], "logo": None})


def write_meta(job_id: str, meta: dict) -> None:
    base = job_dir(job_id)
    meta["updatedAt"] = time.time()
    _write_json(base / "meta.json", meta)
    os.utime(base, None)  # keep the janitor from reaping an active job


def read_status(job_id: str) -> dict:
    base = job_dir(job_id)
    return _read_json(base / "status.json", _idle_status())


def write_status(job_id: str, status: dict) -> None:
    base = job_dir(job_id)
    _write_json(base / "status.json", status)


def delete_job(job_id: str) -> None:
    base = safe_job_dir(root_dir(), job_id)
    remove_tree(base)
    with _LOCKS_GUARD:
        _LOCKS.pop(job_id, None)


# --------------------------------------------------------------------------
# Uploads
# --------------------------------------------------------------------------

def add_images(job_id: str, files) -> list:
    """Validate and store uploaded originals. Returns their metadata."""
    base = job_dir(job_id)
    meta = read_meta(job_id)
    existing = meta.get("images", [])

    if not files:
        raise ApiError("NO_FILES", "No images were received.", 400)
    if len(existing) + len(files) > config.MAX_IMAGES:
        raise ApiError(
            "TOO_MANY_IMAGES",
            "This session allows up to %d images (you already have %d)."
            % (config.MAX_IMAGES, len(existing)),
            400,
        )

    added = []
    for storage in files:
        original_name = sanitize_filename(storage.filename or "image")
        check_extension(original_name, config.ALLOWED_EXTENSIONS)
        data = storage.read()
        check_size(data, original_name)
        info = inspect_image(data, original_name)

        image_id = uuid.uuid4().hex
        stored_name = image_id + (split_ext(original_name)[1] or ".bin")
        (base / "source" / stored_name).write_bytes(data)

        record = {
            "id": image_id,
            "name": original_name,
            "storedName": stored_name,
            "format": info["format"],
            "mime": info["mime"],
            "width": info["width"],
            "height": info["height"],
            "size": info["size"],
            "mode": info["mode"],
            "hasAlpha": info["hasAlpha"],
            "animated": info["animated"],
        }
        existing.append(record)
        added.append(record)

    meta["images"] = existing
    write_meta(job_id, meta)
    return added


def remove_image(job_id: str, image_id: str) -> None:
    safe_id(image_id)
    base = job_dir(job_id)
    meta = read_meta(job_id)
    remaining = []
    removed = None
    for record in meta.get("images", []):
        if record["id"] == image_id:
            removed = record
        else:
            remaining.append(record)
    if removed is None:
        raise ApiError("IMAGE_NOT_FOUND", "That image is not part of this session.", 404)

    for folder in ("source", "output"):
        for candidate in (base / folder).glob(image_id + ".*"):
            try:
                candidate.unlink()
            except OSError:  # pragma: no cover
                pass

    meta["images"] = remaining
    write_meta(job_id, meta)


def set_logo(job_id: str, storage) -> dict:
    base = job_dir(job_id)
    meta = read_meta(job_id)

    original_name = sanitize_filename(storage.filename or "logo.png")
    check_extension(original_name, config.ALLOWED_LOGO_EXTENSIONS)
    data = storage.read()
    check_size(data, original_name)
    info = inspect_image(data, original_name)

    logo_id = uuid.uuid4().hex
    stored_name = logo_id + (split_ext(original_name)[1] or ".png")
    remove_tree(base / "logo")
    (base / "logo").mkdir(parents=True, exist_ok=True)
    (base / "logo" / stored_name).write_bytes(data)

    record = {
        "id": logo_id,
        "name": original_name,
        "storedName": stored_name,
        "format": info["format"],
        "mime": info["mime"],
        "width": info["width"],
        "height": info["height"],
        "size": info["size"],
        "hasAlpha": info["hasAlpha"],
    }
    meta["logo"] = record
    write_meta(job_id, meta)
    return record


def clear_logo(job_id: str) -> None:
    base = job_dir(job_id)
    meta = read_meta(job_id)
    remove_tree(base / "logo")
    (base / "logo").mkdir(parents=True, exist_ok=True)
    meta["logo"] = None
    write_meta(job_id, meta)


def source_path(job_id: str, record: dict) -> Path:
    return job_dir(job_id) / "source" / record["storedName"]


# --------------------------------------------------------------------------
# Processing
# --------------------------------------------------------------------------

def build_specs(job_id: str, payload: dict):
    """Turn the request payload into one RenderSpec per image, in order."""
    meta = read_meta(job_id)
    images = meta.get("images", [])
    if not images:
        raise ApiError("NO_IMAGES", "Upload at least one image before processing.", 400)

    payload = payload or {}
    order = payload.get("order")
    if isinstance(order, list) and order:
        by_id = {record["id"]: record for record in images}
        ordered = [by_id[i] for i in order if i in by_id]
        # Anything the client forgot to mention keeps its existing position.
        ordered += [record for record in images if record["id"] not in set(order)]
        images = ordered

    logo_settings = LogoSettings.from_payload(payload.get("logo"))
    label_settings = LabelSettings.from_payload(payload.get("character"))
    export_settings = ExportSettings.from_payload(payload.get("export"))
    transforms = payload.get("transforms") or {}
    # Extra text / stamps, keyed by image id: strictly per image.
    overlays = payload.get("overlays") or {}

    specs = []
    for index, record in enumerate(images):
        transform = Transform.from_payload(transforms.get(record["id"]))
        specs.append(
            {
                "record": record,
                "index": index,
                "label": alphabetic_label(index),
                "spec": RenderSpec(
                    transform=transform,
                    logo=logo_settings,
                    label=label_settings,
                    export=export_settings,
                    label_text=alphabetic_label(index),
                    overlays=parse_elements(overlays.get(record["id"])),
                ),
            }
        )
    return specs, meta


def load_logo_image(job_id: str, meta: dict):
    record = meta.get("logo")
    if not record:
        return None
    path = job_dir(job_id) / "logo" / record["storedName"]
    if not path.is_file():
        return None
    with Image.open(path) as logo:
        logo.load()
        return logo.convert("RGBA")


def start_processing(job_id: str, payload: dict) -> dict:
    """Kick off a batch render. Returns the initial status document."""
    lock = _lock_for(job_id)
    with lock:
        current = read_status(job_id)
        if current.get("status") == "processing":
            raise ApiError(
                "ALREADY_PROCESSING", "This session is already being processed.", 409
            )

        specs, meta = build_specs(job_id, payload)
        status = {
            "status": "processing",
            "total": len(specs),
            "completed": 0,
            "failed": 0,
            "progress": 0,
            "results": [],
            "startedAt": time.time(),
            "finishedAt": None,
        }
        write_status(job_id, status)

    thread = threading.Thread(
        target=_run_batch,
        args=(job_id, specs, meta),
        name="logoforge-job-%s" % job_id[:8],
        daemon=True,
    )
    thread.start()
    return status


def _run_batch(job_id: str, specs: list, meta: dict) -> None:
    """Render every image. Always leaves a terminal status behind.

    A crash here used to strand the job in "processing" forever, with the
    client polling an answer that would never change, so the whole body is
    guarded.
    """
    try:
        _render_batch(job_id, specs, meta)
    except Exception:  # noqa: BLE001
        log.exception("Job %s: batch failed", job_id)
        try:
            write_status(
                job_id,
                {
                    "status": "failed",
                    "total": len(specs),
                    "completed": 0,
                    "failed": len(specs),
                    "progress": 100,
                    "results": [],
                    "startedAt": None,
                    "finishedAt": time.time(),
                    "error": "Processing stopped unexpectedly. Please try again.",
                },
            )
        except Exception:  # pragma: no cover - the session is gone
            log.warning("Job %s: could not record the failure", job_id)


def _render_batch(job_id: str, specs: list, meta: dict) -> None:
    base = job_dir(job_id)
    started_at = read_status(job_id).get("startedAt") or time.time()
    output_dir = base / "output"
    remove_tree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        logo_image = load_logo_image(job_id, meta)
    except Exception:  # noqa: BLE001
        log.exception("Job %s: logo could not be loaded", job_id)
        logo_image = None

    results = [None] * len(specs)
    counters = {"completed": 0, "failed": 0}
    guard = threading.Lock()

    logo_record = meta.get("logo") or {}
    # An image element may stamp the job's logo again, anywhere on the frame.
    assets = {logo_record["id"]: logo_image} if logo_image and logo_record.get("id") else {}
    if logo_image is not None:
        assets["logo"] = logo_image

    def work(item):
        index = item["index"]
        record = item["record"]
        spec: RenderSpec = item["spec"]
        spec.logo_image = logo_image
        spec.assets = assets
        try:
            outcome = render(source_path(job_id, record), spec, record)
            filename = branded_name(record["name"], outcome.extension)
            stored = record["id"] + outcome.extension
            (output_dir / stored).write_bytes(outcome.data)
            entry = {
                "imageId": record["id"],
                "index": index,
                "label": item["label"],
                "sourceName": record["name"],
                "filename": filename,
                "storedName": stored,
                "width": outcome.width,
                "height": outcome.height,
                "format": outcome.image_format,
                "mime": outcome.mime,
                "size": len(outcome.data),
                "passthrough": outcome.passthrough,
                "resampled": outcome.resampled,
                "notes": outcome.notes,
                "status": "completed",
            }
        except ApiError as exc:
            entry = _failure(record, index, item["label"], exc.message)
        except Exception:  # noqa: BLE001
            log.exception("Job %s: failed to render %s", job_id, record["id"])
            entry = _failure(
                record, index, item["label"], "This image could not be processed."
            )

        with guard:
            results[index] = entry
            key = "completed" if entry["status"] == "completed" else "failed"
            counters[key] += 1
            done = counters["completed"] + counters["failed"]
            write_status(
                job_id,
                {
                    "status": "processing",
                    "total": len(specs),
                    "completed": counters["completed"],
                    "failed": counters["failed"],
                    "progress": int(round(done * 100 / max(1, len(specs)))),
                    "results": [r for r in results if r],
                    "startedAt": started_at,
                    "finishedAt": None,
                },
            )

    try:
        # Bounded concurrency: full resolution images are memory hungry.
        list(_EXECUTOR.map(work, specs))
    finally:
        if logo_image is not None:
            logo_image.close()

    final = [r for r in results if r]
    write_status(
        job_id,
        {
            "status": "completed" if counters["failed"] == 0 else (
                "failed" if counters["completed"] == 0 else "partial"
            ),
            "total": len(specs),
            "completed": counters["completed"],
            "failed": counters["failed"],
            "progress": 100,
            "results": final,
            "startedAt": started_at,
            "finishedAt": time.time(),
        },
    )


def _failure(record: dict, index: int, label: str, message: str) -> dict:
    return {
        "imageId": record["id"],
        "index": index,
        "label": label,
        "sourceName": record["name"],
        "filename": None,
        "storedName": None,
        "status": "failed",
        "error": message,
    }


def process_sync(job_id: str, payload: dict) -> dict:
    """Synchronous variant used by the tests and by small batches."""
    specs, meta = build_specs(job_id, payload)
    write_status(
        job_id,
        {
            "status": "processing",
            "total": len(specs),
            "completed": 0,
            "failed": 0,
            "progress": 0,
            "results": [],
            "startedAt": time.time(),
            "finishedAt": None,
        },
    )
    _run_batch(job_id, specs, meta)
    return read_status(job_id)


def completed_results(job_id: str) -> list:
    status = read_status(job_id)
    return [r for r in status.get("results", []) if r.get("status") == "completed"]


def output_path(job_id: str, image_id: str) -> tuple:
    """Return ``(path, result_entry)`` for a rendered image."""
    safe_id(image_id)
    for entry in completed_results(job_id):
        if entry["imageId"] == image_id:
            path = job_dir(job_id) / "output" / entry["storedName"]
            if not path.is_file():
                break
            return path, entry
    raise ApiError(
        "RESULT_NOT_FOUND",
        "That processed image is not available. Try processing again.",
        404,
    )


def spec_to_dict(spec: RenderSpec) -> dict:  # pragma: no cover - debugging helper
    return {
        "transform": asdict(spec.transform),
        "logo": asdict(spec.logo),
        "label": asdict(spec.label),
        "export": asdict(spec.export),
        "labelText": spec.label_text,
    }
