"""The quality guarantees, asserted rather than assumed."""
from __future__ import annotations

import io

import pytest
from PIL import Image

from services.image_processor import RenderSpec, render
from services.label_service import LabelSettings
from services.logo_processor import LogoSettings
from services.transform_service import ExportSettings, Transform
from tests.conftest import make_image, make_logo
from tests.test_processing import meta, open_result, spec, write


def test_4000x3000_original_export_is_not_resized(tmp_path):
    path = write(tmp_path, "huge.jpg", make_image(4000, 3000))
    result = render(
        path,
        spec(
            label=LabelSettings(enabled=True),
            label_text="A",
            logo=LogoSettings.from_payload({"position": "top-right", "sizePercent": 12}),
            logo_image=Image.open(io.BytesIO(make_logo())).convert("RGBA"),
        ),
        meta("JPEG"),
    )
    assert (result.width, result.height) == (4000, 3000)
    assert result.resampled is False, "original export must not resample the source"
    with open_result(result) as image:
        assert image.size == (4000, 3000)


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_container_is_preserved(tmp_path, fmt):
    path = write(tmp_path, "src." + fmt.lower(), make_image(600, 400, fmt=fmt))
    result = render(
        path, spec(label=LabelSettings(enabled=True), label_text="B"), meta(fmt)
    )
    assert result.image_format == fmt
    with open_result(result) as image:
        assert image.format == fmt


def test_png_output_is_lossless(tmp_path):
    """A PNG re-encoded through the pipeline must be pixel identical."""
    source = Image.new("RGB", (64, 64))
    pixels = source.load()
    for x in range(64):
        for y in range(64):
            pixels[x, y] = (x * 4 % 256, y * 4 % 256, (x + y) * 2 % 256)
    buffer = io.BytesIO()
    source.save(buffer, format="PNG")
    path = write(tmp_path, "src.png", buffer.getvalue())

    # A non-identity offset forces a real re-encode rather than a passthrough.
    result = render(path, spec(label=LabelSettings(enabled=True), label_text="A"), meta("PNG"))
    with open_result(result) as image:
        assert image.convert("RGB").crop((0, 0, 64, 20)).tobytes() == (
            source.crop((0, 0, 64, 20)).tobytes()
        )


def test_jpeg_is_encoded_at_maximum_quality(tmp_path):
    """Round-tripping must not visibly degrade a JPEG."""
    source = Image.new("RGB", (256, 256))
    pixels = source.load()
    for x in range(256):
        for y in range(256):
            pixels[x, y] = (x, y, (x * y) % 256)
    buffer = io.BytesIO()
    source.save(buffer, format="JPEG", quality=95, subsampling=0)
    path = write(tmp_path, "src.jpg", buffer.getvalue())
    original = Image.open(io.BytesIO(buffer.getvalue())).convert("RGB")

    result = render(path, spec(label=LabelSettings(enabled=True), label_text="A"), meta("JPEG"))
    with open_result(result) as image:
        rendered = image.convert("RGB").crop((0, 0, 256, 100))
    reference = original.crop((0, 0, 256, 100))

    diff = [
        abs(a - b)
        for a, b in zip(rendered.tobytes(), reference.tobytes())
    ]
    assert max(diff) <= 6, "unexpected loss: max channel delta %d" % max(diff)
    assert sum(diff) / len(diff) < 0.5


def test_webp_stays_lossless_at_quality_100(tmp_path):
    path = write(tmp_path, "src.webp", make_image(200, 200, (12, 200, 90), fmt="WEBP", lossless=True))
    result = render(
        path,
        spec(
            transform=Transform(),
            label=LabelSettings(enabled=True),
            label_text="A",
            export=ExportSettings.from_payload({"format": "original", "quality": 100}),
        ),
        meta("WEBP"),
    )
    with open_result(result) as image:
        assert image.convert("RGB").getpixel((10, 10)) == (12, 200, 90)


def test_downscale_happens_once_and_only_when_required(tmp_path):
    path = write(tmp_path, "src.jpg", make_image(4000, 3000))
    original = render(path, spec(), meta("JPEG"))
    instagram = render(
        path,
        spec(export=ExportSettings.from_payload({"format": "instagram-square"})),
        meta("JPEG"),
    )
    assert original.resampled is False
    assert instagram.resampled is True
    assert (instagram.width, instagram.height) == (1080, 1080)


@pytest.mark.parametrize(
    "src_w,src_h",
    [(4000, 3000), (3024, 4032), (6000, 4000)],
)
def test_original_export_never_resizes_regardless_of_source_size(tmp_path, src_w, src_h):
    """Regression guard: for Original export, output size must equal input size."""
    path = write(tmp_path, "src.jpg", make_image(src_w, src_h))
    result = render(path, spec(), meta("JPEG"))
    assert (result.width, result.height) == (src_w, src_h)
    with open_result(result) as image:
        assert image.size == (src_w, src_h)


@pytest.mark.parametrize(
    "fmt,preset,expected",
    [
        ("original", "original", None),  # None -> must equal the source size
        ("instagram-square", "instagram-square", (1080, 1080)),
        ("925x1131", "925x1131", (925, 1131)),
    ],
)
def test_fixed_presets_never_drift_from_their_declared_size(tmp_path, fmt, preset, expected):
    """Regression guard: a fixed preset's output must equal its declared size,
    never something close to it (an off-by-rounding bug would show up here)."""
    src_w, src_h = 3333, 2222
    path = write(tmp_path, "src.jpg", make_image(src_w, src_h))
    result = render(
        path, spec(export=ExportSettings.from_payload({"format": preset})), meta("JPEG")
    )
    want = expected or (src_w, src_h)
    assert (result.width, result.height) == want


def test_exif_orientation_is_applied_once_not_reapplied(tmp_path):
    """A sideways phone photo (EXIF Orientation=6) must render upright, at the
    *displayed* dimensions - and the stale orientation tag must not survive
    into the output, which would make a second viewer rotate it again."""
    raw = Image.new("RGB", (40, 20), (10, 10, 10))
    pixels = raw.load()
    for x in range(40):
        for y in range(20):
            pixels[x, y] = (220, 30, 30) if x < 20 else (30, 30, 220)

    exif = raw.getexif()
    exif[0x0112] = 6  # Orientation tag: needs a 90 degree turn to display upright
    buffer = io.BytesIO()
    raw.save(buffer, format="JPEG", quality=95, exif=exif)
    path = write(tmp_path, "sideways.jpg", buffer.getvalue())

    result = render(path, spec(), meta("JPEG"))

    # Orientation 6 swaps width/height exactly once: 40x20 source -> 20x40 output.
    assert (result.width, result.height) == (20, 40)
    with open_result(result) as image:
        assert image.size == (20, 40)
        output_exif = image.getexif()
        assert output_exif.get(0x0112, 1) == 1, "orientation tag must not survive the transpose"


def test_multiple_images_each_keep_their_own_dimensions_under_original(tmp_path):
    """One batch, three different source sizes: Original must not let any of
    them drift towards a shared size."""
    sizes = [(4000, 3000), (640, 480), (1234, 4321)]
    for src_w, src_h in sizes:
        path = write(tmp_path, "src-%dx%d.jpg" % (src_w, src_h), make_image(src_w, src_h))
        result = render(path, spec(), meta("JPEG"))
        assert (result.width, result.height) == (src_w, src_h)


def test_quality_setting_changes_file_size(tmp_path):
    path = write(tmp_path, "src.jpg", make_image(800, 800, (120, 60, 200)))
    best = render(
        path,
        spec(
            label=LabelSettings(enabled=True),
            label_text="A",
            export=ExportSettings.from_payload({"quality": 100}),
        ),
        meta("JPEG"),
    )
    smaller = render(
        path,
        spec(
            label=LabelSettings(enabled=True),
            label_text="A",
            export=ExportSettings.from_payload({"quality": 60}),
        ),
        meta("JPEG"),
    )
    assert len(best.data) > len(smaller.data)
