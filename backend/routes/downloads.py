"""Download endpoints: individual files and the ZIP bundle."""
from __future__ import annotations

from flask import Blueprint, jsonify, request, send_file

from services import job_store, zip_service
from utils.errors import ApiError

bp = Blueprint("downloads", __name__)


@bp.get("/jobs/<job_id>/files/<image_id>")
def download_file(job_id: str, image_id: str):
    job_store.job_dir(job_id)
    path, entry = job_store.output_path(job_id, image_id)
    zip_service.validate_output(path, entry)
    response = send_file(
        path,
        mimetype=entry.get("mime") or "application/octet-stream",
        as_attachment=True,
        download_name=entry.get("filename") or path.name,
        conditional=True,
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.get("/jobs/<job_id>/zip")
def download_zip(job_id: str):
    job_store.job_dir(job_id)
    archive = zip_service.build_zip(job_id)
    response = send_file(
        archive,
        mimetype="application/zip",
        as_attachment=True,
        download_name=zip_service.ZIP_NAME,
        conditional=False,
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.post("/create-zip")
def create_zip_alias():
    """Compatibility alias returning the ZIP for a session."""
    body = request.get_json(silent=True) or {}
    job_id = body.get("jobId") or request.args.get("jobId")
    if not job_id:
        raise ApiError("MISSING_JOB_ID", "A jobId is required.", 400)
    job_store.job_dir(job_id)
    zip_service.build_zip(job_id)
    return jsonify(
        {
            "success": True,
            "jobId": job_id,
            "zipUrl": "/api/jobs/%s/zip" % job_id,
            "filename": zip_service.ZIP_NAME,
        }
    )
