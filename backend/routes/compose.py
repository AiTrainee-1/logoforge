"""The single-canvas composer: render one canvas, then download it."""
from __future__ import annotations

from flask import Blueprint, jsonify, request, send_file

from services import compose_service, job_store

bp = Blueprint("compose", __name__)


@bp.post("/jobs/<job_id>/compose")
def compose(job_id: str):
    """Render the canvas and keep it ready for download.

    The response describes exactly what was produced so the UI can show the
    real output size rather than a guess.
    """
    job_store.job_dir(job_id)
    payload = request.get_json(silent=True) or {}
    composition = compose_service.render_composition(job_id, payload)
    compose_service.store_composition(job_id, composition)
    return jsonify(
        {
            "success": True,
            "jobId": job_id,
            "width": composition.width,
            "height": composition.height,
            "format": composition.image_format,
            "mime": composition.mime,
            "size": len(composition.data),
            "filename": composition.filename,
            "passthrough": composition.passthrough,
            "downloadUrl": "/api/jobs/%s/compose/file" % job_id,
        }
    )


@bp.get("/jobs/<job_id>/compose/file")
def download(job_id: str):
    job_store.job_dir(job_id)
    path, meta = compose_service.stored_composition(job_id)
    response = send_file(
        path,
        mimetype=meta.get("mime") or "application/octet-stream",
        as_attachment=True,
        download_name=meta.get("filename") or path.name,
        conditional=False,
    )
    response.headers["Cache-Control"] = "no-store"
    return response
