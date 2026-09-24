"""The shared transform model - the contract the frontend preview mirrors."""
from __future__ import annotations

import pytest

from services.logo_processor import LogoSettings, logo_box
from services.transform_service import (
    ExportSettings,
    Transform,
    base_scale,
    compute_frame,
    compute_placement,
    is_identity,
    scaled_px,
)


def export(**kwargs):
    return ExportSettings.from_payload(kwargs)


def test_original_frame_is_the_source_size():
    assert compute_frame(4000, 3000, export(format="original")) == (4000, 3000)
    assert compute_frame(517, 913, export(format="original")) == (517, 913)


@pytest.mark.parametrize(
    "preset,expected",
    [
        ("instagram-portrait", (1080, 1350)),
        ("instagram-square", (1080, 1080)),
        ("instagram-landscape", (1080, 566)),
    ],
)
def test_instagram_presets(preset, expected):
    assert compute_frame(4000, 3000, export(format=preset)) == expected


def test_925x1131_preset():
    assert compute_frame(4000, 3000, export(format="925x1131")) == (925, 1131)
    assert compute_frame(500, 500, export(format="925x1131")) == (925, 1131)


def test_unknown_export_falls_back_to_original():
    assert compute_frame(1200, 800, export(format="nonsense")) == (1200, 800)


def test_base_scale_cover_and_contain():
    assert base_scale(1000, 1000, 500, 250, "cover") == pytest.approx(0.5)
    assert base_scale(1000, 1000, 500, 250, "contain") == pytest.approx(0.25)


def test_default_placement_is_centred_and_covers_the_frame():
    placement = compute_placement(4000, 3000, 1080, 1350, Transform(), "cover")
    assert placement.width >= 1080 - 1e-6
    assert placement.height >= 1350 - 1e-6
    # centred: equal overflow on both sides
    assert placement.x == pytest.approx(1080 - (placement.x + placement.width))
    assert placement.y == pytest.approx(1350 - (placement.y + placement.height))


def test_original_export_with_default_transform_is_identity():
    placement = compute_placement(4000, 3000, 4000, 3000, Transform())
    assert placement.scale == pytest.approx(1.0)
    assert is_identity(placement, 4000, 3000, 4000, 3000)


@pytest.mark.parametrize("scale", [1.0, 1.5, 2.0, 0.5])
def test_scale_multiplies_the_drawn_size(scale):
    placement = compute_placement(1000, 1000, 1000, 1000, Transform(scale=scale))
    assert placement.width == pytest.approx(1000 * scale)
    assert placement.height == pytest.approx(1000 * scale)


def test_offsets_are_percentages_of_the_frame():
    base = compute_placement(1000, 1000, 1000, 1000, Transform())
    right = compute_placement(1000, 1000, 1000, 1000, Transform(offset_x=10))
    down = compute_placement(1000, 1000, 1000, 1000, Transform(offset_y=25))
    assert right.x - base.x == pytest.approx(100)
    assert down.y - base.y == pytest.approx(250)


def test_negative_offsets_move_the_other_way():
    base = compute_placement(800, 600, 800, 600, Transform())
    left = compute_placement(800, 600, 800, 600, Transform(offset_x=-10))
    up = compute_placement(800, 600, 800, 600, Transform(offset_y=-10))
    assert left.x < base.x
    assert up.y < base.y


def test_offsets_are_resolution_independent():
    """The same numbers must describe a preview and a full size export."""
    transform = Transform(scale=1.3, offset_x=12, offset_y=-8)
    small = compute_placement(4000, 3000, 540, 675, transform)
    large = compute_placement(4000, 3000, 1080, 1350, transform)
    assert large.x == pytest.approx(small.x * 2)
    assert large.y == pytest.approx(small.y * 2)
    assert large.width == pytest.approx(small.width * 2)


def test_transform_payload_is_clamped():
    transform = Transform.from_payload({"scale": 999, "offsetX": "nonsense"})
    assert transform.scale == 10.0
    assert transform.offset_x == 0.0


def test_reference_pixels_scale_with_the_frame():
    assert scaled_px(30, 1080) == pytest.approx(30)
    assert scaled_px(30, 2160) == pytest.approx(60)


@pytest.mark.parametrize(
    "position,expected_corner",
    [
        ("top-left", (30.0, 30.0)),
        ("top-right", (1080 - 30 - 108.0, 30.0)),
        ("bottom-left", (30.0, 1080 - 30 - 54.0)),
        ("bottom-right", (1080 - 30 - 108.0, 1080 - 30 - 54.0)),
    ],
)
def test_logo_anchors(position, expected_corner):
    settings = LogoSettings.from_payload(
        {"position": position, "sizePercent": 10, "margin": 30}
    )
    x, y, width, height = logo_box(1080, 1080, 200, 100, settings)
    assert (width, height) == pytest.approx((108.0, 54.0))
    assert (x, y) == pytest.approx(expected_corner)


def test_logo_centre_position():
    settings = LogoSettings.from_payload({"position": "center", "sizePercent": 10})
    x, y, width, height = logo_box(1000, 800, 200, 100, settings)
    assert x + width / 2 == pytest.approx(500)
    assert y + height / 2 == pytest.approx(400)


def test_logo_keeps_its_aspect_ratio():
    settings = LogoSettings.from_payload({"sizePercent": 20})
    _, _, width, height = logo_box(2000, 2000, 300, 900, settings)
    assert width / height == pytest.approx(300 / 900)


def test_logo_margin_scales_with_output_resolution():
    settings = LogoSettings.from_payload({"position": "top-left", "margin": 30})
    small = logo_box(1080, 1080, 100, 100, settings)
    large = logo_box(4320, 4320, 100, 100, settings)
    assert large[0] == pytest.approx(small[0] * 4)
