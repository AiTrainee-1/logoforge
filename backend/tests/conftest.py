"""Shared test fixtures."""
from __future__ import annotations

import io
import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import config  # noqa: E402
import app as app_module  # noqa: E402


@pytest.fixture(autouse=True)
def temp_storage(tmp_path, monkeypatch):
    """Point every job directory at an isolated temp folder."""
    monkeypatch.setattr(config, "TEMP_DIR", tmp_path / "logoforge")
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    yield config.TEMP_DIR


@pytest.fixture
def flask_app():
    application = app_module.create_app(start_background_jobs=False)
    application.config.update(TESTING=True)
    return application


@pytest.fixture
def client(flask_app):
    return flask_app.test_client()


def make_image(width=800, height=600, color=(30, 90, 200), mode="RGB", fmt="JPEG", **kwargs):
    """Return encoded bytes for a solid colour test image."""
    image = Image.new(mode, (width, height), color)
    buffer = io.BytesIO()
    save_kwargs = {"quality": 95} if fmt == "JPEG" else {}
    save_kwargs.update(kwargs)
    image.save(buffer, format=fmt, **save_kwargs)
    return buffer.getvalue()


def make_logo(width=200, height=100, color=(255, 0, 0, 255)):
    image = Image.new("RGBA", (width, height), color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def upload(client, files, logo=None):
    """Create a job with the given ``[(name, bytes)]`` images."""
    data = {"images": [(io.BytesIO(payload), name) for name, payload in files]}
    if logo is not None:
        data["logo"] = (io.BytesIO(logo), "logo.png")
    response = client.post("/api/jobs", data=data, content_type="multipart/form-data")
    assert response.status_code == 201, response.get_json()
    return response.get_json()


@pytest.fixture
def sample_files():
    return [
        ("photo-one.jpg", make_image(800, 600, (200, 40, 40))),
        ("photo-two.jpg", make_image(640, 480, (40, 200, 40))),
        ("photo-three.jpg", make_image(500, 500, (40, 40, 200))),
    ]
