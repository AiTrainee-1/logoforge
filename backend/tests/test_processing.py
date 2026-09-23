"""End to end rendering: placement, logo, label and encoding."""
from __future__ import annotations

import io

import pytest
from PIL import Image

from services.image_processor import RenderSpec, render
from services.label_service import LabelSettings
from services.logo_processor import LogoSettings
from services.transform_service import ExportSettings, Transform
from tests.conftest import make_image, make_logo


def write(tmp_path, name, data):
    path = tmp_path / name
    path.write_bytes(data)
    return path


def spec(**kwargs):
    defaults = dict(
        transform=Transform(),
        logo=LogoSettings(),
        label=LabelSettings(enabled=False),
        export=ExportSettings(),
        label_text="",
        logo_image=None,
    )
    defaults.update(kwargs)
    return RenderSpec(**defaults)


def meta(fmt="JPEG", **kwargs):
    base = {"format": fmt, "name": "test", "width": 0, "height": 0}
    base.update(kwargs)
    return base


def open_result(result):
    return Image.open(io.BytesIO(result.data))


# --- format and dimension preservation ------------------------------------

@pytest.mark.parametrize(
    "fmt,extension",
    [("JPEG", ".jpg"), ("PNG", ".png"), ("WEBP", ".webp")],
)
def test_original_export_keeps_format_and_dimensions(tmp_path, fmt, extension):
    data = make_image(1234, 789, fmt=fmt)
    path = write(tmp_path, "src" + extension, data)
    result = render(
        path,
        spec(label=LabelSettings(enabled=True), label_text="A"),
        meta(fmt),
    )
    assert (result.width, result.height) == (1234, 789)
    assert result.image_format == fmt
    assert result.extension == extension
    with open_result(result) as image:
        assert image.size == (1234, 789)
        assert image.format == fmt


def test_small_image_is_handled(tmp_path):
    path = write(tmp_path, "tiny.png", make_image(16, 16, fmt="PNG"))
    result = render(path, spec(label=LabelSettings(enabled=True), label_text="A"), meta("PNG"))
    assert (result.width, result.height) == (16, 16)


def test_high_resolution_image_keeps_its_resolution(tmp_path):
    path = write(tmp_path, "big.jpg", make_image(4000, 3000))
    result = render(path, spec(), meta("JPEG"))
    assert (result.width, result.height) == (4000, 3000)


def test_png_transparency_survives(tmp_path):
    source = Image.new("RGBA", (300, 300), (255, 0, 0, 0))
    buffer = io.BytesIO()
    source.save(buffer, format="PNG")
    path = write(tmp_path, "alpha.png", buffer.getvalue())
    result = render(path, spec(), meta("PNG"))
    with open_result(result) as image:
        assert image.convert("RGBA").getpixel((10, 10))[3] == 0


def test_gif_is_written_as_png(tmp_path):
    path = write(tmp_path, "anim.gif", make_image(200, 200, fmt="GIF"))
    result = render(path, spec(), meta("GIF"))
    assert result.image_format == "PNG"
    assert result.notes


# --- passthrough ----------------------------------------------------------

def test_untouched_original_is_copied_byte_for_byte(tmp_path):
    data = make_image(640, 480)
    path = write(tmp_path, "src.jpg", data)
    result = render(path, spec(), meta("JPEG"))
    assert result.passthrough is True
    assert result.data == data


def test_label_disables_passthrough(tmp_path):
    data = make_image(640, 480)
    path = write(tmp_path, "src.jpg", data)
    result = render(
        path, spec(label=LabelSettings(enabled=True), label_text="A"), meta("JPEG")
    )
    assert result.passthrough is False
    assert result.data != data


# --- instagram presets ----------------------------------------------------

@pytest.mark.parametrize(
    "preset,expected",
    [
        ("instagram-portrait", (1080, 1350)),
        ("instagram-square", (1080, 1080)),
        ("instagram-landscape", (1080, 566)),
    ],
)
def test_instagram_exports(tmp_path, preset, expected):
    path = write(tmp_path, "src.jpg", make_image(4000, 3000))
    result = render(
        path, spec(export=ExportSettings.from_payload({"format": preset})), meta("JPEG")
    )
    assert (result.width, result.height) == expected
    with open_result(result) as image:
        assert image.size == expected


# --- logo placement -------------------------------------------------------

def logo_image():
    return Image.open(io.BytesIO(make_logo(200, 200))).convert("RGBA")


@pytest.mark.parametrize(
    "position,probe",
    [
        ("top-left", (60, 60)),
        ("top-right", (940, 60)),
        ("bottom-left", (60, 940)),
        ("bottom-right", (940, 940)),
        ("center", (500, 500)),
    ],
)
def test_logo_lands_in_the_right_corner(tmp_path, position, probe):
    path = write(tmp_path, "src.png", make_image(1000, 1000, (0, 0, 0), fmt="PNG"))
    result = render(
        path,
        spec(
            logo=LogoSettings.from_payload(
                {"position": position, "sizePercent": 15, "margin": 30}
            ),
            logo_image=logo_image(),
        ),
        meta("PNG"),
    )
    with open_result(result) as image:
        pixel = image.convert("RGB").getpixel(probe)
    assert pixel[0] > 200 and pixel[1] < 60, "expected the red logo at %s" % (probe,)


def test_logo_opacity_fades_the_logo(tmp_path):
    path = write(tmp_path, "src.png", make_image(1000, 1000, (0, 0, 0), fmt="PNG"))
    faded = render(
        path,
        spec(
            logo=LogoSettings.from_payload(
                {"position": "top-left", "sizePercent": 20, "margin": 30, "opacity": 40}
            ),
            logo_image=logo_image(),
        ),
        meta("PNG"),
    )
    with open_result(faded) as image:
        pixel = image.convert("RGB").getpixel((80, 80))
    assert 60 < pixel[0] < 160, pixel


def test_logo_stays_put_when_the_image_moves(tmp_path):
    path = write(tmp_path, "src.png", make_image(1000, 1000, (0, 0, 0), fmt="PNG"))
    settings = LogoSettings.from_payload(
        {"position": "top-right", "sizePercent": 15, "margin": 30}
    )
    still = render(path, spec(logo=settings, logo_image=logo_image()), meta("PNG"))
    moved = render(
        path,
        spec(
            transform=Transform(scale=1.4, offset_x=-15, offset_y=9),
            logo=settings,
            logo_image=logo_image(),
        ),
        meta("PNG"),
    )
    with open_result(still) as a, open_result(moved) as b:
        assert a.convert("RGB").getpixel((940, 60)) == b.convert("RGB").getpixel((940, 60))


def test_logo_size_is_a_percentage_of_the_frame(tmp_path):
    path = write(tmp_path, "src.png", make_image(1000, 500, (0, 0, 0), fmt="PNG"))
    result = render(
        path,
        spec(
            logo=LogoSettings.from_payload(
                {"position": "top-left", "sizePercent": 10, "margin": 0}
            ),
            logo_image=logo_image(),
        ),
        meta("PNG"),
    )
    with open_result(result) as image:
        rgb = image.convert("RGB")
        # A 200x200 logo at 10% of a 1000px frame is 100x100 at the origin.
        assert rgb.getpixel((95, 95))[0] > 200
        assert rgb.getpixel((105, 105))[0] < 60


# --- character label ------------------------------------------------------

def test_label_is_burned_into_the_pixels(tmp_path):
    path = write(tmp_path, "src.png", make_image(800, 800, (0, 0, 0), fmt="PNG"))
    plain = render(path, spec(), meta("PNG"))
    labelled = render(
        path,
        spec(label=LabelSettings(enabled=True, font_size=90), label_text="A"),
        meta("PNG"),
    )
    with open_result(plain) as a, open_result(labelled) as b:
        assert a.tobytes() != b.tobytes()
        crop = b.convert("RGB").crop((300, 640, 500, 790))
        assert crop.getextrema()[0][1] > 200, "expected white label pixels"


def test_label_sits_at_the_bottom_centre(tmp_path):
    path = write(tmp_path, "src.png", make_image(800, 800, (0, 0, 0), fmt="PNG"))
    result = render(
        path,
        spec(label=LabelSettings(enabled=True, font_size=90), label_text="A"),
        meta("PNG"),
    )
    with open_result(result) as image:
        rgb = image.convert("RGB")
        assert rgb.crop((300, 640, 500, 790)).getextrema()[0][1] > 200
        assert rgb.crop((0, 0, 800, 400)).getextrema()[0][1] < 30  # top half untouched


def test_label_can_be_disabled(tmp_path):
    path = write(tmp_path, "src.png", make_image(400, 400, (0, 0, 0), fmt="PNG"))
    result = render(path, spec(label=LabelSettings(enabled=False)), meta("PNG"))
    with open_result(result) as image:
        assert image.convert("RGB").getextrema()[0][1] == 0


# --- image transform ------------------------------------------------------

def gradient(width, height):
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for x in range(width):
        for y in range(height):
            pixels[x, y] = (int(255 * x / max(1, width - 1)), int(255 * y / max(1, height - 1)), 0)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_scale_zooms_into_the_image(tmp_path):
    path = write(tmp_path, "grad.png", gradient(200, 200))
    plain = render(path, spec(), meta("PNG"))
    zoomed = render(path, spec(transform=Transform(scale=2.0)), meta("PNG"))
    with open_result(plain) as a, open_result(zoomed) as b:
        assert a.size == b.size == (200, 200)
        # Zooming in narrows the range of source pixels on screen.
        assert b.convert("RGB").getpixel((0, 100))[0] > a.convert("RGB").getpixel((0, 100))[0]


@pytest.mark.parametrize("offset", [-20, 20])
def test_horizontal_offset_moves_the_image(tmp_path, offset):
    path = write(tmp_path, "grad.png", gradient(200, 200))
    plain = render(path, spec(transform=Transform(scale=1.5)), meta("PNG"))
    moved = render(
        path, spec(transform=Transform(scale=1.5, offset_x=offset)), meta("PNG")
    )
    with open_result(plain) as a, open_result(moved) as b:
        left = a.convert("RGB").getpixel((100, 100))[0]
        right = b.convert("RGB").getpixel((100, 100))[0]
    assert (right < left) if offset > 0 else (right > left)


@pytest.mark.parametrize("offset", [-20, 20])
def test_vertical_offset_moves_the_image(tmp_path, offset):
    path = write(tmp_path, "grad.png", gradient(200, 200))
    plain = render(path, spec(transform=Transform(scale=1.5)), meta("PNG"))
    moved = render(
        path, spec(transform=Transform(scale=1.5, offset_y=offset)), meta("PNG")
    )
    with open_result(plain) as a, open_result(moved) as b:
        top = a.convert("RGB").getpixel((100, 100))[1]
        bottom = b.convert("RGB").getpixel((100, 100))[1]
    assert (bottom < top) if offset > 0 else (bottom > top)


def test_transforms_are_independent_per_image(tmp_path):
    """Rendering image B must not be influenced by image A's transform."""
    path = write(tmp_path, "grad.png", gradient(120, 120))
    a = render(path, spec(transform=Transform(scale=2.0)), meta("PNG"))
    b = render(path, spec(transform=Transform(scale=1.0)), meta("PNG"))
    control = render(path, spec(transform=Transform(scale=1.0)), meta("PNG"))
    assert b.data == control.data
    assert a.data != b.data


def test_scaling_down_leaves_the_background_visible(tmp_path):
    path = write(tmp_path, "src.png", make_image(400, 400, (255, 255, 255), fmt="PNG"))
    result = render(
        path,
        spec(
            transform=Transform(scale=0.5),
            export=ExportSettings.from_payload(
                {"format": "original", "background": "#000000", "keepTransparency": False}
            ),
        ),
        meta("PNG"),
    )
    with open_result(result) as image:
        assert image.convert("RGB").getpixel((5, 5)) == (0, 0, 0)
        assert image.convert("RGB").getpixel((200, 200)) == (255, 255, 255)
