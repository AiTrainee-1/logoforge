"""The composer page: canvas = the image, or canvas = a card."""
from __future__ import annotations

import io

import pytest
from PIL import Image

from tests.conftest import make_image, make_logo, upload


def text_element(**kwargs):
    payload = {
        "type": "text",
        "text": "SALE",
        "x": 50,
        "y": 50,
        "fontSize": 80,
        "color": "#FFFFFF",
        "background": "none",
    }
    payload.update(kwargs)
    return payload


def compose(client, job_id, **payload):
    response = client.post("/api/jobs/%s/compose" % job_id, json=payload)
    return response


def fetch(client, job_id):
    response = client.get("/api/jobs/%s/compose/file" % job_id)
    assert response.status_code == 200, response.get_json()
    return response


# --- image mode -----------------------------------------------------------

def test_image_mode_keeps_the_original_resolution(client):
    job = upload(client, [("shot.jpg", make_image(3000, 2000))])
    image_id = job["images"][0]["id"]
    body = compose(
        client,
        job["jobId"],
        mode="image",
        baseImageId=image_id,
        elements=[text_element()],
    ).get_json()

    assert body["width"] == 3000
    assert body["height"] == 2000
    assert body["format"] == "JPEG"
    assert body["filename"] == "shot_composed.jpg"

    data = fetch(client, job["jobId"]).data
    with Image.open(io.BytesIO(data)) as image:
        assert image.size == (3000, 2000)
        assert image.format == "JPEG"


def test_image_mode_without_elements_returns_the_original_bytes(client):
    original = make_image(1200, 900)
    job = upload(client, [("plain.jpg", original)])
    body = compose(
        client, job["jobId"], mode="image", baseImageId=job["images"][0]["id"], elements=[]
    ).get_json()
    assert body["passthrough"] is True
    assert fetch(client, job["jobId"]).data == original


@pytest.mark.parametrize(
    "fmt,extension,mime",
    [("JPEG", ".jpg", "image/jpeg"), ("PNG", ".png", "image/png"), ("WEBP", ".webp", "image/webp")],
)
def test_image_mode_preserves_the_container(client, fmt, extension, mime):
    job = upload(client, [("src" + extension, make_image(500, 400, fmt=fmt))])
    body = compose(
        client,
        job["jobId"],
        mode="image",
        baseImageId=job["images"][0]["id"],
        elements=[text_element()],
    ).get_json()
    assert body["format"] == fmt
    assert body["mime"] == mime
    assert body["filename"].endswith(extension)


def test_text_is_burned_into_the_exported_pixels(client):
    job = upload(client, [("dark.png", make_image(600, 600, (0, 0, 0), fmt="PNG"))])
    compose(
        client,
        job["jobId"],
        mode="image",
        baseImageId=job["images"][0]["id"],
        elements=[text_element(text="A", x=50, y=50, fontSize=200)],
    )
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        grey = image.convert("L")
        assert grey.crop((200, 200, 400, 400)).getextrema()[1] > 200
        assert grey.crop((0, 0, 600, 80)).getextrema()[1] < 30


def test_a_logo_can_be_stamped_onto_the_image(client):
    job = upload(
        client,
        [("dark.png", make_image(800, 800, (0, 0, 0), fmt="PNG")), ("brand.png", make_logo(200, 200))],
    )
    base, logo = job["images"][0]["id"], job["images"][1]["id"]
    compose(
        client,
        job["jobId"],
        mode="image",
        baseImageId=base,
        elements=[
            {"type": "image", "assetId": logo, "x": 75, "y": 25, "widthPercent": 20},
            text_element(text="B", x=25, y=75),
        ],
    )
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        pixel = image.convert("RGB").getpixel((600, 200))
    assert pixel[0] > 200 and pixel[1] < 60


# --- card mode ------------------------------------------------------------

@pytest.mark.parametrize(
    "preset,expected",
    [
        ("a4-150", (1240, 1754)),
        ("a4-300", (2480, 3508)),
        ("square-1080", (1080, 1080)),
        ("story-1080", (1080, 1920)),
    ],
)
def test_card_presets(client, preset, expected):
    job = upload(client, [("shot.jpg", make_image(400, 400))])
    body = compose(
        client, job["jobId"], mode="card", preset=preset, elements=[text_element()]
    ).get_json()
    assert (body["width"], body["height"]) == expected
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        assert image.size == expected
        assert image.format == "PNG"


def test_card_places_the_photo_as_an_element(client):
    job = upload(client, [("red.jpg", make_image(400, 400, (220, 20, 20)))])
    image_id = job["images"][0]["id"]
    compose(
        client,
        job["jobId"],
        mode="card",
        preset="square-1080",
        background="#FFFFFF",
        elements=[{"type": "image", "assetId": image_id, "x": 50, "y": 50, "widthPercent": 50}],
    )
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        rgb = image.convert("RGB")
        assert rgb.getpixel((540, 540))[0] > 180  # the photo
        assert rgb.getpixel((20, 20)) == (255, 255, 255)  # the card background


def test_card_background_colour_is_honoured(client):
    job = upload(client, [("shot.jpg", make_image(200, 200))])
    compose(
        client, job["jobId"], mode="card", preset="square-1080", background="#101820", elements=[]
    )
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        assert image.convert("RGB").getpixel((10, 10)) == (16, 24, 32)


def test_transparent_card_keeps_its_alpha(client):
    job = upload(client, [("shot.jpg", make_image(200, 200))])
    compose(
        client,
        job["jobId"],
        mode="card",
        preset="square-1080",
        transparent=True,
        outputFormat="png",
        elements=[],
    )
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        assert image.convert("RGBA").getpixel((10, 10))[3] == 0


def test_custom_canvas_size(client):
    job = upload(client, [("shot.jpg", make_image(200, 200))])
    body = compose(
        client, job["jobId"], mode="card", preset="custom", width=1500, height=600, elements=[]
    ).get_json()
    assert (body["width"], body["height"]) == (1500, 600)


def test_absurd_canvas_size_is_rejected(client):
    job = upload(client, [("shot.jpg", make_image(200, 200))])
    response = compose(
        client, job["jobId"], mode="card", preset="custom", width=50000, height=50000
    )
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "CANVAS_TOO_LARGE"


# --- errors ---------------------------------------------------------------

def test_image_mode_needs_a_base_image(client):
    job = upload(client, [("shot.jpg", make_image(200, 200))])
    response = compose(client, job["jobId"], mode="image", elements=[])
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "NO_BASE_IMAGE"


def test_unknown_base_image_is_rejected(client):
    job = upload(client, [("shot.jpg", make_image(200, 200))])
    response = compose(
        client, job["jobId"], mode="image", baseImageId="0123456789abcdef", elements=[]
    )
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "IMAGE_NOT_FOUND"


def test_download_before_compose_is_a_friendly_error(client):
    job = upload(client, [("shot.jpg", make_image(200, 200))])
    response = client.get("/api/jobs/%s/compose/file" % job["jobId"])
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "NOTHING_TO_DOWNLOAD"


def test_compose_on_a_dead_session_is_a_friendly_error(client):
    response = client.post("/api/jobs/%s/compose" % ("a" * 32), json={"mode": "card"})
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "JOB_NOT_FOUND"


def test_capabilities_expose_the_card_presets(client):
    payload = client.get("/api/capabilities").get_json()
    assert payload["cardPresets"]["a4-150"]["width"] == 1240
    assert payload["cardPresets"]["a4-300"]["height"] == 3508
    assert isinstance(payload["fontUrls"], dict)


def test_font_endpoint_refuses_paths_outside_the_asset_folder(client):
    assert client.get("/api/fonts/..%2f..%2fapp.py").status_code == 404
    assert client.get("/api/fonts/missing.ttf").status_code == 404
