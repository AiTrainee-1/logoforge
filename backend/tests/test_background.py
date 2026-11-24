"""Frame background: edge matching, top-to-bottom blends and seam softening."""
from __future__ import annotations

import io
import struct
import zlib

import pytest
from PIL import Image, ImageDraw

from services.background_service import EASE_STOPS, analyse_edges, ease
from services.image_processor import render
from services.transform_service import ExportSettings, Transform
from tests.conftest import make_image, upload
from tests.test_processing import meta, open_result, spec, write

GREY = (236, 236, 236)
WALL = (220, 212, 198)
FLOOR = (150, 120, 90)
RED = (220, 30, 30)


def encode(image: Image.Image, fmt: str = "PNG", **kwargs) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **kwargs)
    return buffer.getvalue()


def product_shot(width=1000, height=1000, backdrop=GREY, mode="RGB") -> bytes:
    """A plain backdrop with a dark product in the middle, clear of every edge."""
    fill = backdrop + (255,) if mode == "RGBA" else backdrop
    image = Image.new(mode, (width, height), fill)
    product = (60, 40, 25, 255) if mode == "RGBA" else (60, 40, 25)
    ImageDraw.Draw(image).rectangle(
        (width * 0.1, height * 0.35, width * 0.9, height * 0.65), fill=product
    )
    return encode(image)


def wall_and_floor(width=1000, height=1000) -> bytes:
    image = Image.new("RGB", (width, height), WALL)
    ImageDraw.Draw(image).rectangle((0, height // 2, width - 1, height - 1), fill=FLOOR)
    return encode(image)


def contain(**kwargs) -> ExportSettings:
    """925 x 1131 frame, photo fitted inside: a square photo leaves bands
    of background above and below it (frame y 0-103 and 1028-1131)."""
    base = dict(format="925x1131", fit="contain")
    base.update(kwargs)
    return ExportSettings(**base)


def rgb_at(result, xy):
    with open_result(result) as image:
        return image.convert("RGB").getpixel(xy)


# --- measuring the edges ---------------------------------------------------

def test_plain_backdrop_is_measured_exactly(tmp_path):
    edge = analyse_edges(write(tmp_path, "shot.png", product_shot()))
    assert edge["transparent"] is False
    assert edge["color"] == "#ECECEC"
    assert {edge[side] for side in ("top", "bottom", "left", "right")} == {"#ECECEC"}
    assert edge["agreement"] == 1.0


def test_jpeg_backdrop_is_measured_within_compression_noise(tmp_path):
    shot = Image.open(io.BytesIO(product_shot(2000, 2000))).convert("RGB")
    edge = analyse_edges(write(tmp_path, "shot.jpg", encode(shot, "JPEG", quality=90)))
    measured = tuple(int(edge["color"][i : i + 2], 16) for i in (1, 3, 5))
    assert max(abs(a - b) for a, b in zip(measured, GREY)) <= 2
    assert edge["agreement"] > 0.95


def test_something_touching_one_edge_does_not_move_the_colour(tmp_path):
    image = Image.new("RGB", (800, 800), GREY)
    # A dark product standing on the bottom edge.
    ImageDraw.Draw(image).rectangle((300, 560, 500, 799), fill=(20, 20, 20))
    edge = analyse_edges(write(tmp_path, "shot.png", encode(image)))
    assert edge["color"] == "#ECECEC"
    assert edge["bottom"] == "#ECECEC"  # still the majority along that edge
    assert edge["agreement"] < 1.0


def test_wall_and_floor_report_their_own_top_and_bottom(tmp_path):
    edge = analyse_edges(write(tmp_path, "room.png", wall_and_floor()))
    assert edge["top"] == "#DCD4C6"
    assert edge["bottom"] == "#96785A"
    assert edge["agreement"] < 0.85  # two colours: not a plain backdrop


def test_transparent_edges_have_nothing_to_match(tmp_path):
    image = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    ImageDraw.Draw(image).rectangle((100, 100, 300, 300), fill=(200, 30, 30, 255))
    assert analyse_edges(write(tmp_path, "cutout.png", encode(image))) == {"transparent": True}


def test_exif_orientation_is_applied_before_measuring(tmp_path):
    # Stored sideways: orientation 6 turns the stored left edge into the
    # displayed top edge, which is what the renderer exports.
    image = Image.new("RGB", (600, 400), GREY)
    ImageDraw.Draw(image).rectangle((0, 0, 39, 399), fill=RED)
    exif = Image.Exif()
    exif[0x0112] = 6
    edge = analyse_edges(write(tmp_path, "sideways.png", encode(image, exif=exif.tobytes())))
    assert edge["top"] == "#DC1E1E"
    assert edge["bottom"] == "#ECECEC"


@pytest.mark.parametrize(
    "name,shape",
    [
        # Trimmed to its bounding box, as background removers export it: the
        # silhouette touches every edge, but only at a few points.
        ("ellipse.png", lambda d: d.ellipse((0, 0, 799, 599), fill=(110, 70, 40, 255))),
        # A bottle standing on the bottom edge.
        ("bottle.png", lambda d: d.rectangle((300, 150, 500, 599), fill=(20, 90, 40, 255))),
    ],
)
def test_cutout_touching_the_edges_has_nothing_to_match(tmp_path, name, shape):
    cutout = Image.new("RGBA", (800, 600), (0, 0, 0, 0))
    shape(ImageDraw.Draw(cutout))
    path = write(tmp_path, name, encode(cutout))
    # The few opaque edge pixels are the product, not a backdrop.
    assert analyse_edges(path) == {"transparent": True}

    export = contain(background_mode="match", keep_transparency=True)
    result = render(path, spec(export=export), meta("PNG"))
    with open_result(result) as image:
        image = image.convert("RGBA")
        assert image.getpixel((5, 300))[3] == 0  # beside the product: still see-through
        assert image.getpixel((462, 20))[3] == 0  # band above the photo too


def test_rounded_corners_still_match(tmp_path):
    shot = Image.new("RGBA", (800, 800), (0, 0, 0, 0))
    ImageDraw.Draw(shot).rounded_rectangle((0, 0, 799, 799), radius=24, fill=GREY + (255,))
    edge = analyse_edges(write(tmp_path, "rounded.png", encode(shot)))
    assert edge["transparent"] is False
    assert edge["color"] == "#ECECEC"


def png_with_chunk(image: Image.Image, kind: bytes, payload: bytes) -> bytes:
    """``image`` as PNG with an extra chunk right after IHDR."""
    data = encode(image)
    crc = struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    chunk = struct.pack(">I", len(payload)) + kind + payload + crc
    return data[:33] + chunk + data[33:]  # 8-byte signature + 25-byte IHDR


@pytest.mark.parametrize("payload", [b"II*\x00", b"\x00" * 7, b"MM\x00\x2a\x00\x00\x00\x08\xff\xff"])
def test_corrupt_exif_does_not_stop_matching(tmp_path, payload):
    # The renderer shows such a photo as stored; the measurement must too.
    shot = Image.new("RGB", (400, 400), (200, 200, 200))
    path = write(tmp_path, "exif.png", png_with_chunk(shot, b"eXIf", payload))
    edge = analyse_edges(path)
    assert edge is not None and edge["color"] == "#C8C8C8"
    result = render(path, spec(export=contain(background_mode="match")), meta("PNG", edge=edge))
    assert rgb_at(result, (462, 20)) == (200, 200, 200)


def test_unreadable_file_is_not_fatal(tmp_path):
    assert analyse_edges(write(tmp_path, "broken.jpg", b"not an image at all")) is None


@pytest.mark.parametrize("size", [(1, 1), (2, 2), (3, 50), (50, 3)])
def test_tiny_images_are_measured(tmp_path, size):
    edge = analyse_edges(write(tmp_path, "tiny.png", make_image(*size, (10, 20, 30), fmt="PNG")))
    assert edge["color"] == "#0A141E"


def test_ease_runs_from_zero_to_one_through_the_shared_stops():
    assert ease(-1) == 0.0 and ease(0) == 0.0
    assert ease(1) == 1.0 and ease(2) == 1.0
    for t, value in EASE_STOPS:
        assert ease(t) == pytest.approx(value)
    assert ease(0.5) == pytest.approx(0.5)


# --- the rendered background -------------------------------------------------

def test_fixed_colour_fills_the_bands_when_matching_is_off(tmp_path):
    path = write(tmp_path, "shot.png", product_shot())
    assert rgb_at(render(path, spec(export=contain()), meta("PNG")), (460, 20)) == (255, 255, 255)
    result = render(path, spec(export=contain(background="#336699")), meta("PNG"))
    assert rgb_at(result, (460, 20)) == (0x33, 0x66, 0x99)


def test_match_continues_the_backdrop_to_the_frame_edges(tmp_path):
    path = write(tmp_path, "shot.png", product_shot())
    result = render(path, spec(export=contain(background_mode="match")), meta("PNG"))
    assert (result.width, result.height) == (925, 1131)
    assert rgb_at(result, (460, 20)) == GREY  # band above the photo
    assert rgb_at(result, (460, 1110)) == GREY  # band below it
    assert rgb_at(result, (460, 565)) == (60, 40, 25)  # the product is untouched


def test_render_uses_the_colours_measured_at_upload(tmp_path):
    path = write(tmp_path, "shot.png", product_shot())
    stored = {
        "transparent": False,
        "color": "#123456",
        "top": "#123456",
        "bottom": "#123456",
        "left": "#123456",
        "right": "#123456",
        "agreement": 1.0,
    }
    result = render(path, spec(export=contain(background_mode="match")), meta("PNG", edge=stored))
    assert rgb_at(result, (460, 20)) == (0x12, 0x34, 0x56)


def test_top_to_bottom_blend_follows_each_edge(tmp_path):
    path = write(tmp_path, "room.png", wall_and_floor())
    blend = render(
        path,
        spec(export=contain(background_mode="match", background_style="vertical")),
        meta("PNG"),
    )
    assert rgb_at(blend, (460, 20)) == WALL
    assert rgb_at(blend, (460, 1110)) == FLOOR

    solid = render(path, spec(export=contain(background_mode="match")), meta("PNG"))
    assert rgb_at(solid, (460, 20)) == rgb_at(solid, (460, 1110))


def test_blend_runs_down_the_side_bands(tmp_path):
    # A landscape frame puts the bands at the sides, where the blend goes
    # from the top colour at the top to the bottom colour at the bottom.
    path = write(tmp_path, "room.png", wall_and_floor())
    export = ExportSettings(
        format="instagram-landscape", fit="contain",
        background_mode="match", background_style="vertical",
    )
    result = render(path, spec(export=export), meta("PNG"))
    assert rgb_at(result, (10, 1)) == WALL
    assert rgb_at(result, (10, 564)) == FLOOR
    middle = rgb_at(result, (10, 283))
    assert FLOOR[0] < middle[0] < WALL[0]


def test_blend_follows_the_edges_of_a_cropped_photo(tmp_path):
    # A portrait photo whose backdrop darkens from 230 at the top to 150 at the
    # bottom, zoomed to 120% so its top and bottom are cropped off. The side
    # bands must still match the photo's edge on every row.
    gradient = Image.linear_gradient("L").resize((600, 1000)).point(lambda v: 230 - v * 80 // 255)
    photo = Image.merge("RGB", (gradient, gradient, gradient))
    path = write(tmp_path, "sweep.png", encode(photo))
    export = ExportSettings(
        format="instagram-square", fit="contain",
        background_mode="match", background_style="vertical",
    )
    result = render(path, spec(transform=Transform(scale=1.2), export=export), meta("PNG"))
    # The photo spans x 151-929 and y -108 to 1188 of the 1080 x 1080 frame.
    for row in (0, 100, 540, 980, 1079):
        band = rgb_at(result, (60, row))[0]
        photo_edge = rgb_at(result, (156, row))[0]
        assert abs(band - photo_edge) <= 3, (row, band, photo_edge)


def test_match_fills_the_bands_even_when_transparency_is_kept(tmp_path):
    path = write(tmp_path, "shot.png", product_shot(mode="RGBA"))
    export = contain(background_mode="match", keep_transparency=True)
    result = render(path, spec(export=export), meta("PNG"))
    with open_result(result) as image:
        assert image.convert("RGBA").getpixel((460, 20)) == GREY + (255,)


def test_transparent_edges_keep_transparent_bands(tmp_path):
    cutout = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
    ImageDraw.Draw(cutout).rectangle((300, 300, 700, 700), fill=RED + (255,))
    path = write(tmp_path, "cutout.png", encode(cutout))
    result = render(
        path, spec(export=contain(background_mode="match", keep_transparency=True)), meta("PNG")
    )
    with open_result(result) as image:
        assert image.mode == "RGBA"
        assert image.getpixel((460, 20))[3] == 0
    assert any("transparent" in note for note in result.notes)


def test_untouched_original_is_still_copied_byte_for_byte(tmp_path):
    data = make_image(800, 600)
    path = write(tmp_path, "src.jpg", data)
    export = ExportSettings(background_mode="match", seam_soften=40)
    result = render(path, spec(export=export), meta("JPEG"))
    assert result.passthrough is True
    assert result.data == data


# --- softening the seam ------------------------------------------------------

def red_square(tmp_path):
    return write(tmp_path, "red.png", make_image(1000, 1000, RED, fmt="PNG"))


def test_seam_is_hard_by_default(tmp_path):
    result = render(red_square(tmp_path), spec(export=contain()), meta("PNG"))
    assert rgb_at(result, (460, 103)) == RED
    assert rgb_at(result, (460, 102)) == (255, 255, 255)


def test_soften_seam_fades_only_the_edges_that_meet_the_background(tmp_path):
    # 40 px at 1080 wide is ~34 px in a 925 px frame. The photo spans the full
    # width, so only its top and bottom edges meet the background.
    result = render(red_square(tmp_path), spec(export=contain(seam_soften=40)), meta("PNG"))
    at_edge = rgb_at(result, (460, 103))
    halfway = rgb_at(result, (460, 120))
    assert at_edge[1] > 240  # almost all background
    assert 60 < halfway[1] < 200  # a mix of the two
    assert rgb_at(result, (460, 150)) == RED  # fully opaque past the fade
    assert rgb_at(result, (460, 1010)) != RED  # bottom edge fades too
    assert rgb_at(result, (1, 565)) == RED  # side edges touch the frame: no fade


def test_soften_seam_fades_all_four_sides_of_a_scaled_down_photo(tmp_path):
    result = render(
        red_square(tmp_path),
        spec(transform=Transform(scale=0.5), export=contain(seam_soften=40)),
        meta("PNG"),
    )
    # Scaled to 50% the photo covers x 231-692 and y 334-795.
    assert rgb_at(result, (232, 565))[1] > 200  # just inside the left edge
    assert rgb_at(result, (691, 565))[1] > 200  # just inside the right edge
    assert rgb_at(result, (462, 336))[1] > 200  # just inside the top edge
    assert rgb_at(result, (462, 565)) == RED


# --- API ---------------------------------------------------------------------

def test_upload_reports_each_photos_edge_colour(client):
    job = upload(client, [("shot.png", product_shot()), ("room.png", wall_and_floor())])
    shot, room = job["images"]
    assert shot["edge"]["color"] == "#ECECEC"
    assert shot["edge"]["agreement"] == 1.0
    assert (room["edge"]["top"], room["edge"]["bottom"]) == ("#DCD4C6", "#96785A")


def test_matched_background_round_trip(client):
    job = upload(client, [("shot.png", product_shot())])
    job_id = job["jobId"]
    response = client.post(
        "/api/jobs/%s/process" % job_id,
        json={
            "sync": True,
            "character": {"enabled": False},
            "export": {
                "format": "925x1131",
                "fit": "contain",
                "backgroundMode": "match",
                "backgroundStyle": "solid",
                "seamSoften": 0,
            },
        },
    )
    assert response.status_code == 200, response.get_json()
    results = client.get("/api/jobs/%s/results" % job_id).get_json()["results"]
    data = client.get(results[0]["downloadUrl"]).data
    with Image.open(io.BytesIO(data)) as image:
        assert image.size == (925, 1131)
        assert image.convert("RGB").getpixel((460, 20)) == GREY


def test_export_payload_parses_the_background_options():
    parsed = ExportSettings.from_payload(
        {"backgroundMode": "match", "backgroundStyle": "vertical", "seamSoften": 25}
    )
    assert (parsed.background_mode, parsed.background_style, parsed.seam_soften) == (
        "match", "vertical", 25.0,
    )
    junk = ExportSettings.from_payload(
        {"backgroundMode": "rainbow", "backgroundStyle": "zigzag", "seamSoften": 999}
    )
    assert (junk.background_mode, junk.background_style, junk.seam_soften) == (
        "color", "solid", 60.0,
    )
    assert ExportSettings.from_payload({}).background_mode == "color"
