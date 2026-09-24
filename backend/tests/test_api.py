"""API surface: upload, process, download, ZIP, cleanup and error shapes."""
from __future__ import annotations

import io
import zipfile

from PIL import Image

from tests.conftest import make_image, make_logo, upload


def process(client, job_id, **payload):
    body = {"sync": True}
    body.update(payload)
    response = client.post("/api/jobs/%s/process" % job_id, json=body)
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "service": "logoforge-api"}


def test_capabilities(client):
    payload = client.get("/api/capabilities").get_json()
    assert payload["limits"]["maxImages"] >= 1
    assert ".jpg" in payload["accept"]["images"]
    assert payload["exportPresets"]["instagram-portrait"] == {"width": 1080, "height": 1350}
    assert payload["exportPresets"]["925x1131"] == {"width": 925, "height": 1131}


def test_upload_reports_real_dimensions(client, sample_files):
    job = upload(client, sample_files)
    assert len(job["images"]) == 3
    assert job["images"][0]["width"] == 800
    assert job["images"][0]["height"] == 600
    assert job["images"][0]["name"] == "photo-one.jpg"


def test_full_flow_individual_and_zip_match(client, sample_files):
    job = upload(client, sample_files, logo=make_logo())
    job_id = job["jobId"]

    status = process(
        client,
        job_id,
        logo={"position": "top-right", "sizePercent": 12, "margin": 30},
        character={"enabled": True, "fontSize": 36},
        export={"format": "original", "quality": 100},
        transforms={job["images"][0]["id"]: {"scale": 1.2, "offsetX": 5, "offsetY": -4}},
    )
    assert status["status"] == "completed"
    assert status["completed"] == 3

    results = client.get("/api/jobs/%s/results" % job_id).get_json()
    names = [entry["filename"] for entry in results["results"]]
    assert names == [
        "photo-one_branded.jpg",
        "photo-two_branded.jpg",
        "photo-three_branded.jpg",
    ]
    assert [entry["label"] for entry in results["results"]] == ["A", "B", "C"]

    downloads = {}
    for entry in results["results"]:
        response = client.get(entry["downloadUrl"])
        assert response.status_code == 200
        assert "attachment" in response.headers["Content-Disposition"]
        downloads[entry["filename"]] = response.data

    archive = client.get("/api/jobs/%s/zip" % job_id)
    assert archive.status_code == 200
    with zipfile.ZipFile(io.BytesIO(archive.data)) as bundle:
        assert sorted(bundle.namelist()) == sorted(downloads)
        for name in bundle.namelist():
            # The ZIP packages the exact same bytes - no recompression.
            assert bundle.read(name) == downloads[name]
            with Image.open(io.BytesIO(bundle.read(name))) as image:
                assert image.size[0] > 0


def test_original_dimensions_survive_the_round_trip(client):
    job = upload(client, [("wide.jpg", make_image(2400, 1200))], logo=make_logo())
    job_id = job["jobId"]
    process(client, job_id, character={"enabled": True}, export={"format": "original"})
    results = client.get("/api/jobs/%s/results" % job_id).get_json()["results"]
    assert (results[0]["width"], results[0]["height"]) == (2400, 1200)
    data = client.get(results[0]["downloadUrl"]).data
    with Image.open(io.BytesIO(data)) as image:
        assert image.size == (2400, 1200)
        assert image.format == "JPEG"


def test_instagram_export_only_resizes_when_asked(client):
    job = upload(client, [("shot.jpg", make_image(2000, 1500))])
    job_id = job["jobId"]
    process(client, job_id, export={"format": "instagram-portrait"})
    results = client.get("/api/jobs/%s/results" % job_id).get_json()["results"]
    assert (results[0]["width"], results[0]["height"]) == (1080, 1350)


def test_925x1131_export_via_api(client):
    job = upload(client, [("shot.jpg", make_image(2000, 1500))])
    job_id = job["jobId"]
    process(client, job_id, export={"format": "925x1131"})
    results = client.get("/api/jobs/%s/results" % job_id).get_json()["results"]
    assert (results[0]["width"], results[0]["height"]) == (925, 1131)
    data = client.get(results[0]["downloadUrl"]).data
    with Image.open(io.BytesIO(data)) as image:
        assert image.size == (925, 1131)


def test_labels_follow_the_requested_order(client, sample_files):
    job = upload(client, sample_files)
    job_id = job["jobId"]
    ids = [image["id"] for image in job["images"]]
    reordered = [ids[2], ids[0], ids[1]]
    process(client, job_id, order=reordered, character={"enabled": True})
    results = client.get("/api/jobs/%s/results" % job_id).get_json()["results"]
    by_id = {entry["imageId"]: entry["label"] for entry in results}
    assert by_id[ids[2]] == "A"
    assert by_id[ids[0]] == "B"
    assert by_id[ids[1]] == "C"


def test_async_processing_reports_progress(client, sample_files):
    job = upload(client, sample_files)
    job_id = job["jobId"]
    response = client.post("/api/jobs/%s/process" % job_id, json={})
    assert response.status_code == 202

    for _ in range(200):
        status = client.get("/api/jobs/%s" % job_id).get_json()
        if status["status"] in ("completed", "failed", "partial"):
            break
        import time

        time.sleep(0.05)
    assert status["status"] == "completed"
    assert status["progress"] == 100


def test_add_and_remove_images(client, sample_files):
    job = upload(client, sample_files[:1])
    job_id = job["jobId"]
    response = client.post(
        "/api/jobs/%s/images" % job_id,
        data={"images": [(io.BytesIO(make_image(300, 300)), "extra.jpg")]},
        content_type="multipart/form-data",
    )
    assert response.status_code == 201
    assert len(response.get_json()["images"]) == 2

    target = response.get_json()["images"][0]["id"]
    removed = client.delete("/api/jobs/%s/images/%s" % (job_id, target))
    assert removed.status_code == 200
    assert len(removed.get_json()["images"]) == 1


def test_logo_can_be_replaced_and_cleared(client, sample_files):
    job = upload(client, sample_files[:1])
    job_id = job["jobId"]
    response = client.post(
        "/api/jobs/%s/logo" % job_id,
        data={"logo": (io.BytesIO(make_logo()), "brand.png")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 201
    assert response.get_json()["logo"]["width"] == 200

    cleared = client.delete("/api/jobs/%s/logo" % job_id)
    assert cleared.get_json()["logo"] is None


def test_deleting_a_job_removes_everything(client, sample_files):
    job = upload(client, sample_files)
    job_id = job["jobId"]
    process(client, job_id)
    assert client.delete("/api/jobs/%s" % job_id).status_code == 200
    missing = client.get("/api/jobs/%s" % job_id)
    assert missing.status_code == 404
    assert missing.get_json()["error"]["code"] == "JOB_NOT_FOUND"


# --- error handling -------------------------------------------------------

def test_corrupted_upload_is_rejected(client):
    response = client.post(
        "/api/jobs",
        data={"images": [(io.BytesIO(b"this is not an image"), "broken.jpg")]},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    body = response.get_json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_IMAGE"
    assert "Traceback" not in str(body)


def test_unsupported_extension_is_rejected(client):
    response = client.post(
        "/api/jobs",
        data={"images": [(io.BytesIO(b"MZ\x00\x00"), "payload.exe")]},
        content_type="multipart/form-data",
    )
    assert response.status_code == 415
    assert response.get_json()["error"]["code"] == "UNSUPPORTED_FORMAT"


def test_path_traversal_ids_are_rejected(client):
    response = client.get("/api/jobs/..%2f..%2fetc")
    assert response.status_code in (400, 404)
    assert response.get_json()["success"] is False


def test_zip_before_processing_is_a_friendly_error(client, sample_files):
    job = upload(client, sample_files)
    response = client.get("/api/jobs/%s/zip" % job["jobId"])
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "NOTHING_TO_DOWNLOAD"


def test_processing_without_images_is_rejected(client):
    job_id = client.post("/api/jobs").get_json()["jobId"]
    response = client.post("/api/jobs/%s/process" % job_id, json={"sync": True})
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "NO_IMAGES"


def test_filename_is_sanitised_on_upload(client):
    job = upload(client, [("../../evil name.jpg", make_image(120, 120))])
    assert job["images"][0]["name"] == "evil name.jpg"
