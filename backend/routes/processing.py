"""Job lifecycle: upload, configure, render, inspect."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from services import job_store
from utils.errors import ApiError

bp = Blueprint("processing", __name__)

IMAGE_FIELDS = ("images", "images[]", "files", "file")
LOGO_FIELDS = ("logo", "watermark")


def collect_images(req):
    files = []
    for field in IMAGE_FIELDS:
        files.extend(req.files.getlist(field))
    return [f for f in files if f and f.filename]


def collect_logo(req):
    for field in LOGO_FIELDS:
        storage = req.files.get(field)
        if storage and storage.filename:
            return storage
    return None


def job_payload(job_id: str) -> dict:
    meta = job_store.read_meta(job_id)
    status = job_store.read_status(job_id)
    return {
        "success": True,
        "jobId": job_id,
        "images": meta.get("images", []),
        "logo": meta.get("logo"),
        "status": status.get("status"),
        "progress": status.get("progress", 0),
        "completed": status.get("completed", 0),
        "total": status.get("total", 0),
        "failed": status.get("failed", 0),
    }


@bp.post("/jobs")
def create_job():
    """Create an editing session. Images and a logo may be sent straight away."""
    job_id = job_store.create_job()
    images = collect_images(request)
    if images:
        job_store.add_images(job_id, images)
    logo = collect_logo(request)
    if logo is not None:
        job_store.set_logo(job_id, logo)
    return jsonify(job_payload(job_id)), 201


@bp.post("/upload")
def upload_alias():
    """Compatibility alias for POST /api/jobs.

    When ``jobId`` is supplied the files are appended to that session instead.
    """
    job_id = request.form.get("jobId") or request.args.get("jobId")
    if not job_id:
        return create_job()
    job_store.job_dir(job_id)
    images = collect_images(request)
    if images:
        job_store.add_images(job_id, images)
    logo = collect_logo(request)
    if logo is not None:
        job_store.set_logo(job_id, logo)
    return jsonify(job_payload(job_id)), 200


@bp.get("/jobs/<job_id>")
def job_status(job_id: str):
    status = job_store.read_status(job_id)
    payload = job_payload(job_id)
    payload["results"] = status.get("results", [])
    payload["startedAt"] = status.get("startedAt")
    payload["finishedAt"] = status.get("finishedAt")
    return jsonify(payload)


@bp.delete("/jobs/<job_id>")
def destroy_job(job_id: str):
    job_store.job_dir(job_id)  # validates and confirms existence
    job_store.delete_job(job_id)
    return jsonify({"success": True, "jobId": job_id, "deleted": True})


@bp.post("/jobs/<job_id>/images")
def add_images(job_id: str):
    job_store.job_dir(job_id)
    images = collect_images(request)
    if not images:
        raise ApiError("NO_FILES", "No images were received.", 400)
    added = job_store.add_images(job_id, images)
    payload = job_payload(job_id)
    payload["added"] = added
    return jsonify(payload), 201


@bp.delete("/jobs/<job_id>/images/<image_id>")
def remove_image(job_id: str, image_id: str):
    job_store.job_dir(job_id)
    job_store.remove_image(job_id, image_id)
    return jsonify(job_payload(job_id))


@bp.post("/jobs/<job_id>/logo")
def set_logo(job_id: str):
    job_store.job_dir(job_id)
    logo = collect_logo(request)
    if logo is None:
        raise ApiError("NO_LOGO", "No logo file was received.", 400)
    record = job_store.set_logo(job_id, logo)
    return jsonify({"success": True, "jobId": job_id, "logo": record}), 201


@bp.delete("/jobs/<job_id>/logo")
def clear_logo(job_id: str):
    job_store.job_dir(job_id)
    job_store.clear_logo(job_id)
    return jsonify({"success": True, "jobId": job_id, "logo": None})


def _render_body():
    body = request.get_json(silent=True)
    if body is None and request.form:
        body = {}
    return body or {}


@bp.post("/jobs/<job_id>/process")
def process(job_id: str):
    """Render every image in the session.

    Defaults to a background batch (poll ``GET /api/jobs/<id>``). Pass
    ``{"sync": true}`` for small batches that should finish in the request.
    """
    job_store.job_dir(job_id)
    body = _render_body()
    if body.get("sync"):
        status = job_store.process_sync(job_id, body)
        return jsonify({"success": True, "jobId": job_id, **status}), 200
    status = job_store.start_processing(job_id, body)
    return jsonify({"success": True, "jobId": job_id, **status}), 202


@bp.post("/process")
def process_alias():
    """Compatibility alias: synchronous render of one session."""
    body = _render_body()
    job_id = body.get("jobId") or request.args.get("jobId")
    if not job_id:
        raise ApiError("MISSING_JOB_ID", "A jobId is required.", 400)
    job_store.job_dir(job_id)
    status = job_store.process_sync(job_id, body)
    return jsonify({"success": True, "jobId": job_id, **status})


@bp.post("/process-batch")
def process_batch_alias():
    """Compatibility alias: background render of one session."""
    body = _render_body()
    job_id = body.get("jobId") or request.args.get("jobId")
    if not job_id:
        raise ApiError("MISSING_JOB_ID", "A jobId is required.", 400)
    job_store.job_dir(job_id)
    status = job_store.start_processing(job_id, body)
    return jsonify({"success": True, "jobId": job_id, **status}), 202


@bp.get("/jobs/<job_id>/results")
def results(job_id: str):
    status = job_store.read_status(job_id)
    entries = []
    for entry in status.get("results", []):
        item = dict(entry)
        item.pop("storedName", None)
        if item.get("status") == "completed":
            item["downloadUrl"] = "/api/jobs/%s/files/%s" % (job_id, item["imageId"])
        entries.append(item)
    return jsonify(
        {
            "success": True,
            "jobId": job_id,
            "status": status.get("status"),
            "progress": status.get("progress", 0),
            "total": status.get("total", 0),
            "completed": status.get("completed", 0),
            "failed": status.get("failed", 0),
            "results": entries,
            "zipUrl": "/api/jobs/%s/zip" % job_id,
        }
    )
