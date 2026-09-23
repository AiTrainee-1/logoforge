"""Free-position elements: extra letters and stamps."""
from __future__ import annotations

import io

import pytest
from PIL import Image

from services.image_processor import render
from services.label_service import LabelSettings
from services.overlay_service import OverlayElement, parse_elements
from services.text_service import TextStyle, render_text_block, text_metrics
from tests.conftest import make_image, make_logo
from tests.test_processing import meta, open_result, spec, write


def element(**kwargs):
    payload = {"type": "text", "text": "J", "fontSize": 90, "background": "none"}
    payload.update(kwargs)
    return OverlayElement.from_payload(payload)


def brightest(image, box):
    return image.convert("L").crop(box).getextrema()[1]


# --- placement ------------------------------------------------------------

def test_text_element_lands_where_it_was_placed(tmp_path):
    path = write(tmp_path, "src.png", make_image(800, 800, (0, 0, 0), fmt="PNG"))
    result = render(
        path,
        spec(overlays=[element(x=25, y=75)]),
        meta("PNG"),
    )
    with open_result(result) as image:
        assert brightest(image, (140, 520, 260, 680)) > 200, "expected the letter here"
        assert brightest(image, (0, 0, 800, 300)) < 30, "top of the frame must be clean"


@pytest.mark.parametrize(
    "x,y,box",
    [
        (10, 10, (20, 20, 140, 140)),
        (90, 10, (660, 20, 780, 140)),
        (10, 90, (20, 660, 140, 780)),
        (90, 90, (660, 660, 780, 780)),
        (50, 50, (340, 340, 460, 460)),
    ],
)
def test_elements_can_sit_anywhere_on_the_frame(tmp_path, x, y, box):
    path = write(tmp_path, "src.png", make_image(800, 800, (0, 0, 0), fmt="PNG"))
    result = render(path, spec(overlays=[element(x=x, y=y)]), meta("PNG"))
    with open_result(result) as image:
        assert brightest(image, box) > 200


def test_several_elements_are_all_drawn(tmp_path):
    path = write(tmp_path, "src.png", make_image(900, 300, (0, 0, 0), fmt="PNG"))
    result = render(
        path,
        spec(
            overlays=[
                element(text="J", x=20, y=50),
                element(text="K", x=50, y=50),
                element(text="L", x=80, y=50),
            ]
        ),
        meta("PNG"),
    )
    with open_result(result) as image:
        assert brightest(image, (120, 90, 240, 210)) > 200
        assert brightest(image, (390, 90, 510, 210)) > 200
        assert brightest(image, (660, 90, 780, 210)) > 200


def test_positions_are_resolution_independent(tmp_path):
    """The same element description must hit the same relative spot."""
    small = write(tmp_path, "small.png", make_image(400, 400, (0, 0, 0), fmt="PNG"))
    large = write(tmp_path, "large.png", make_image(1600, 1600, (0, 0, 0), fmt="PNG"))
    overlays = [element(x=25, y=25, fontSize=120)]

    a = render(small, spec(overlays=overlays), meta("PNG"))
    b = render(large, spec(overlays=overlays), meta("PNG"))
    with open_result(a) as first, open_result(b) as second:
        assert brightest(first, (70, 70, 130, 130)) > 200
        assert brightest(second, (280, 280, 520, 520)) > 200


# --- independence ---------------------------------------------------------

def test_elements_are_per_image(tmp_path):
    """Overlays given to one render must not leak into another."""
    path = write(tmp_path, "src.png", make_image(600, 600, (0, 0, 0), fmt="PNG"))
    with_text = render(path, spec(overlays=[element(text="A", x=30, y=30)]), meta("PNG"))
    without = render(path, spec(overlays=[]), meta("PNG"))
    control = render(path, spec(overlays=[]), meta("PNG"))

    assert without.data == control.data
    assert with_text.data != without.data
    with open_result(without) as image:
        assert image.convert("L").getextrema()[1] == 0


def test_overlays_disable_the_passthrough(tmp_path):
    data = make_image(400, 300)
    path = write(tmp_path, "src.jpg", data)
    assert render(path, spec(), meta("JPEG")).passthrough is True
    assert render(path, spec(overlays=[element()]), meta("JPEG")).passthrough is False


def test_overlays_do_not_change_the_output_size(tmp_path):
    path = write(tmp_path, "src.jpg", make_image(2400, 1600))
    result = render(
        path,
        spec(
            label=LabelSettings(enabled=True),
            label_text="A",
            overlays=[element(text="M", x=30, y=60), element(text="N", x=70, y=60)],
        ),
        meta("JPEG"),
    )
    assert (result.width, result.height) == (2400, 1600)
    assert result.resampled is False


# --- styling --------------------------------------------------------------

def test_rotation_moves_ink_without_moving_the_anchor(tmp_path):
    path = write(tmp_path, "src.png", make_image(600, 600, (0, 0, 0), fmt="PNG"))
    straight = render(path, spec(overlays=[element(text="ABC", x=50, y=50)]), meta("PNG"))
    turned = render(
        path, spec(overlays=[element(text="ABC", x=50, y=50, rotation=90)]), meta("PNG")
    )
    with open_result(straight) as a, open_result(turned) as b:
        assert a.tobytes() != b.tobytes()
        # Rotating about the centre keeps ink at the anchor in both cases.
        assert brightest(a, (270, 270, 330, 330)) > 150
        assert brightest(b, (270, 270, 330, 330)) > 150


def test_opacity_fades_an_element(tmp_path):
    path = write(tmp_path, "src.png", make_image(400, 400, (0, 0, 0), fmt="PNG"))
    faded = render(
        path,
        spec(overlays=[element(text="A", x=50, y=50, fontSize=200, opacity=35)]),
        meta("PNG"),
    )
    with open_result(faded) as image:
        peak = brightest(image, (100, 100, 300, 300))
    assert 40 < peak < 160, peak


def test_pill_background_is_drawn_behind_the_text(tmp_path):
    path = write(tmp_path, "src.png", make_image(600, 600, (255, 255, 255), fmt="PNG"))
    result = render(
        path,
        spec(
            overlays=[
                element(
                    text="A",
                    x=50,
                    y=50,
                    fontSize=120,
                    background="pill",
                    backgroundColor="#000000",
                    backgroundOpacity=100,
                )
            ]
        ),
        meta("PNG"),
    )
    with open_result(result) as image:
        assert image.convert("L").crop((250, 250, 350, 350)).getextrema()[0] < 40


def test_image_element_stamps_an_asset(tmp_path):
    path = write(tmp_path, "src.png", make_image(1000, 1000, (0, 0, 0), fmt="PNG"))
    logo = Image.open(io.BytesIO(make_logo(200, 200))).convert("RGBA")
    result = render(
        path,
        spec(
            overlays=[
                OverlayElement.from_payload(
                    {"type": "image", "assetId": "logo", "x": 25, "y": 25, "widthPercent": 20}
                )
            ],
            assets={"logo": logo},
        ),
        meta("PNG"),
    )
    with open_result(result) as image:
        pixel = image.convert("RGB").getpixel((250, 250))
    assert pixel[0] > 200 and pixel[1] < 60


def test_image_element_with_a_missing_asset_is_skipped(tmp_path):
    path = write(tmp_path, "src.png", make_image(300, 300, (0, 0, 0), fmt="PNG"))
    result = render(
        path,
        spec(
            overlays=[
                OverlayElement.from_payload({"type": "image", "assetId": "gone", "x": 50, "y": 50})
            ]
        ),
        meta("PNG"),
    )
    with open_result(result) as image:
        assert image.convert("L").getextrema()[1] == 0


# --- payload handling -----------------------------------------------------

def test_payload_is_clamped_and_defaulted():
    parsed = parse_elements(
        [
            {"type": "nonsense", "x": "abc", "y": 9999, "opacity": -50, "fontSize": 1e9},
            {"type": "image", "widthPercent": 0},
        ]
    )
    assert parsed[0].type == "text"
    assert parsed[0].x == 50.0
    assert parsed[0].y == 150.0
    assert parsed[0].opacity == 0.0
    assert parsed[0].style.font_size == 600.0
    assert parsed[1].width_percent == 0.5


def test_element_count_is_capped():
    assert len(parse_elements([{"type": "text"}] * 500)) == 60


def test_non_list_payload_is_ignored():
    assert parse_elements(None) == []
    assert parse_elements({"nope": 1}) == []


def test_text_is_trimmed_and_line_limited():
    parsed = parse_elements([{"type": "text", "text": "x" * 900}])[0]
    assert len(parsed.text) == 500
    many = parse_elements([{"type": "text", "text": "\n".join("abcdefghij" * 5)}])[0]
    assert len(many.text.split("\n")) <= 20


# --- text layout ----------------------------------------------------------

def test_multiline_height_follows_the_css_line_box():
    style = TextStyle(font_size=40, line_height=1.5, background="none")
    metrics = text_metrics(1080, style)
    _, one = render_text_block("A", 1080, style)
    _, three = render_text_block("A\nB\nC", 1080, style)
    assert one["height"] == metrics["lineHeightPx"] + metrics["padY"] * 2
    assert three["height"] == metrics["lineHeightPx"] * 3 + metrics["padY"] * 2


def test_font_size_scales_with_the_frame():
    style = TextStyle(font_size=40)
    assert text_metrics(1080, style)["fontPx"] == 40
    assert text_metrics(2160, style)["fontPx"] == 80


def test_alignment_changes_where_short_lines_sit():
    style_left = TextStyle(font_size=60, align="left", background="none")
    style_right = TextStyle(font_size=60, align="right", background="none")
    left, _ = render_text_block("A\nWWWWW", 1080, style_left)
    right, _ = render_text_block("A\nWWWWW", 1080, style_right)
    assert left.size == right.size
    assert left.tobytes() != right.tobytes()
