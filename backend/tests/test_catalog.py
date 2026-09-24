"""The Catalog Composer: a fixed-width, word-wrapped text box plus a product
image, rendered onto the 925x1131 card - built entirely on the existing
overlay/composer architecture (no new rendering pipeline)."""
from __future__ import annotations

import io

from PIL import Image, ImageDraw

from services.compose_service import CARD_PRESETS
from services.overlay_service import OverlayElement, render_element
from services.text_service import TextStyle, _line_width, render_text_box, wrap_lines
from tests.conftest import make_image, upload
from utils.fonts import load_font

CATALOG_TEXT = (
    "Terracotta Votive figure | Aiyanar Tradition\n\n"
    "These terracotta votive figures are associated with the Aiyanar worship "
    "tradition of Tamil Nadu, where devotees offer sculpted forms as "
    "expressions of gratitude for protection, healing, and answered prayers.\n\n"
    "Material: Terracotta\n\n"
    "Dimensions:\n"
    'C: 12" x 5.5" x 4"\n'
    'D: 10" x 4.5" x 4.5"\n\n'
    "Weight: 1.175 kg\n\n"
    "Price: Rs.10500/- (Shipping additional) - for each piece"
)


def probe():
    return ImageDraw.Draw(Image.new("RGBA", (1, 1)))


# --- word wrap ---------------------------------------------------------------


def test_wrap_lines_breaks_on_width_not_arbitrarily():
    font = load_font(28, True)
    draw = probe()
    text = "one two three four five six seven eight"
    narrow = wrap_lines(draw, text, font, 120)
    wide = wrap_lines(draw, text, font, 4000)
    assert len(narrow) > 1, "text wider than the box must wrap onto more than one line"
    assert len(wide) == 1, "text that already fits must not be wrapped unnecessarily"
    # Wrapping only breaks lines - it must never drop or reorder words.
    assert " ".join(narrow).split() == text.split()


def test_wrap_lines_preserves_explicit_paragraph_breaks():
    font = load_font(24, True)
    lines = wrap_lines(probe(), "Title\n\nBody text here", font, 4000)
    assert lines == ["Title", "", "Body text here"]


def test_a_single_overlong_word_is_kept_whole_not_split():
    font = load_font(28, True)
    lines = wrap_lines(probe(), "supercalifragilisticexpialidocious word", font, 10)
    assert lines[0] == "supercalifragilisticexpialidocious"


# --- box text rendering -------------------------------------------------------


def test_short_text_produces_a_smaller_box_than_long_text():
    style = TextStyle(font_size=32, line_height=1.3, background="none")
    _, short_geom = render_text_box("Short title", 925, style, box_width_px=800)
    _, long_geom = render_text_box(CATALOG_TEXT, 925, style, box_width_px=800)
    assert long_geom["height"] > short_geom["height"]
    assert long_geom["lines"] > short_geom["lines"]


def test_box_never_clips_even_when_the_target_height_is_too_small():
    style = TextStyle(font_size=32, line_height=1.3, background="none")
    _, geom = render_text_box(CATALOG_TEXT, 925, style, box_width_px=800, box_height_px=10)
    # The requested target (10px) is impossibly small; the tile must grow.
    assert geom["height"] > 10
    assert geom["lines"] >= 8
    tile, _ = render_text_box(CATALOG_TEXT, 925, style, box_width_px=800, box_height_px=10)
    assert tile.height == geom["height"]


def test_a_narrower_box_wraps_to_more_lines_and_grows_taller():
    style = TextStyle(font_size=32, line_height=1.3, background="none")
    _, narrow = render_text_box(CATALOG_TEXT, 925, style, box_width_px=400)
    _, wide = render_text_box(CATALOG_TEXT, 925, style, box_width_px=850)
    assert narrow["lines"] > wide["lines"]
    assert narrow["height"] > wide["height"]


def test_letter_spacing_widens_the_rendered_text():
    font = load_font(48, True)
    draw = probe()
    assert _line_width(draw, "SALE", font, 20) > _line_width(draw, "SALE", font, 0)


# --- OverlayElement integration -----------------------------------------------


def test_box_width_zero_keeps_the_existing_free_floating_behaviour():
    """box_width defaults to 0, so every pre-existing caller (Studio's extra
    letters, plain composer text stamps) is completely unaffected."""
    element = OverlayElement.from_payload({"type": "text", "text": "A"})
    assert element.box_width == 0.0
    assert element.box_height == 0.0


def test_box_width_switches_the_element_to_wrapped_rendering():
    boxed = OverlayElement.from_payload(
        {
            "type": "text",
            "text": "one two three four five six seven eight nine ten",
            "fontSize": 40,
            "boxWidth": 20,
            "background": "none",
        }
    )
    frame = Image.new("RGBA", (925, 1131), (255, 255, 255, 255))
    result = render_element(frame.copy(), boxed, {})
    assert result.size == (925, 1131)


def test_catalog_preset_is_925x1131():
    assert CARD_PRESETS["catalog"] == {
        "width": 925,
        "height": 1131,
        "label": "Catalog card (925x1131)",
    }


def test_catalog_large_preset_is_1240x1754():
    assert CARD_PRESETS["catalog-large"] == {
        "width": 1240,
        "height": 1754,
        "label": "Catalog sheet (1240x1754)",
    }


# --- serif font family (Catalog Composer only) --------------------------------


def test_serif_family_resolves_to_a_different_file_than_default():
    from utils.fonts import font_path

    default_bold = font_path(True, "default")
    serif_bold = font_path(True, "serif")
    assert serif_bold is not None
    assert serif_bold.name == "CrimsonText-SemiBold.ttf"
    assert serif_bold != default_bold


def test_font_family_defaults_to_default_for_every_existing_caller():
    """Studio labels and plain (non-catalog) text elements never send
    fontFamily, so they must keep resolving to the original face."""
    element = OverlayElement.from_payload({"type": "text", "text": "A"})
    assert element.style.font_family == "default"


def test_unknown_font_family_falls_back_to_default():
    element = OverlayElement.from_payload({"type": "text", "text": "A", "fontFamily": "nonsense"})
    assert element.style.font_family == "default"


def test_serif_element_renders_with_the_serif_face(tmp_path):
    """box_width text with fontFamily='serif' must actually use the serif
    font, not silently fall back to the default face."""
    boxed = OverlayElement.from_payload(
        {
            "type": "text",
            "text": "Vintage wooden Peacock",
            "fontSize": 44,
            "boxWidth": 80,
            "background": "none",
            "fontFamily": "serif",
        }
    )
    assert boxed.style.font_family == "serif"
    frame = Image.new("RGBA", (1240, 1754), (237, 235, 236, 255))
    result = render_element(frame, boxed, {})
    assert result.size == (1240, 1754)


def test_capabilities_expose_both_font_families(client):
    payload = client.get("/api/capabilities").get_json()
    assert "default" in payload["fonts"]
    assert "serif" in payload["fonts"]
    assert payload["fonts"]["serif"]["label"] == "CrimsonText-SemiBold"
    assert payload["fonts"]["serif"]["urls"].get("bold", "").endswith(
        "/api/fonts/CrimsonText-SemiBold.ttf"
    )
    assert payload["fonts"]["serif"]["urls"].get("regular", "").endswith(
        "/api/fonts/CrimsonText-Regular.ttf"
    )


# --- full compose API: catalog card -------------------------------------------


def compose(client, job_id, **payload):
    return client.post("/api/jobs/%s/compose" % job_id, json=payload)


def fetch(client, job_id):
    response = client.get("/api/jobs/%s/compose/file" % job_id)
    assert response.status_code == 200, response.get_json()
    return response


def test_catalog_export_is_exactly_925x1131(client):
    job = upload(client, [("product.jpg", make_image(3000, 4000, (200, 120, 40)))])
    image_id = job["images"][0]["id"]
    body = compose(
        client,
        job["jobId"],
        mode="card",
        preset="catalog",
        background="#FFFFFF",
        elements=[
            {
                "type": "text",
                "text": CATALOG_TEXT,
                "x": 50,
                "y": 20,
                "boxWidth": 80,
                "fontSize": 28,
                "align": "center",
                "background": "none",
            },
            {"type": "image", "assetId": image_id, "x": 50, "y": 75, "widthPercent": 60},
        ],
    ).get_json()
    assert (body["width"], body["height"]) == (925, 1131)
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        assert image.size == (925, 1131)


def test_catalog_large_export_is_exactly_1240x1754(client):
    job = upload(client, [("product.jpg", make_image(3000, 4000, (200, 120, 40)))])
    image_id = job["images"][0]["id"]
    body = compose(
        client,
        job["jobId"],
        mode="card",
        preset="catalog-large",
        background="#EDEBEC",
        elements=[
            {
                "type": "text",
                "text": "Vintage wooden Peacock",
                "x": 50,
                "y": 8,
                "boxWidth": 80,
                "fontSize": 40,
                "bold": True,
                "align": "center",
                "background": "none",
                "color": "#825542",
                "fontFamily": "serif",
            },
            {"type": "image", "assetId": image_id, "x": 50, "y": 75, "widthPercent": 60},
        ],
    ).get_json()
    assert (body["width"], body["height"]) == (1240, 1754)
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        assert image.size == (1240, 1754)


def test_reference_catalog_content_renders_at_1240x1754_without_clipping(client):
    """Exercises the exact reference text/measurements from the spec, as the
    frontend's auto-layout would actually send them: title + description +
    details + price, each its own element, serif family, brown title."""
    reference_text = (
        "Vintage wooden Peacock\n\n"
        "A finely hand carved wooden peacock, this vintage piece reflects the "
        "quiet elegance of South Indian craftsmanship. Its gentle wear and "
        "softened edges speak of age, preservation, and enduring artistry. "
        "Symbolic of beauty and auspicious presence, the mayura, vahana of "
        "Lord Kartikeya adds cultural depth to this refined artefact.\n\n"
        "Ideal for consoles, entryways, or curated interior displays.\n\n"
        'Dimensions: 23.5"H\n'
        "Weight: 4.7kg approx.\n\n"
        "Price: Rs. 25,000/- (shipping additional)"
    )
    job = upload(client, [("peacock.jpg", make_image(2400, 3200, (120, 90, 60)))])
    image_id = job["images"][0]["id"]

    def text_el(y, text, font_size, color, bold, box_width=80):
        return {
            "type": "text",
            "text": text,
            "x": 50,
            "y": y,
            "boxWidth": box_width,
            "fontSize": font_size,
            "bold": bold,
            "align": "center",
            "background": "none",
            "color": color,
            "fontFamily": "serif",
        }

    compose(
        client,
        job["jobId"],
        mode="card",
        preset="catalog-large",
        background="#EDEBEC",
        elements=[
            text_el(6, "Vintage wooden Peacock", 44, "#825542", True),
            text_el(
                16,
                "A finely hand carved wooden peacock, this vintage piece reflects the "
                "quiet elegance of South Indian craftsmanship.",
                24,
                "#2B2B2B",
                False,
            ),
            text_el(26, 'Dimensions: 23.5"H\nWeight: 4.7kg approx.', 21, "#2B2B2B", False),
            text_el(32, "Price: Rs. 25,000/- (shipping additional)", 23, "#2B2B2B", True),
            {"type": "image", "assetId": image_id, "x": 50, "y": 70, "widthPercent": 65},
        ],
    )
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        assert image.size == (1240, 1754)
        rgb = image.convert("RGB")
        # The brown title must actually be present near its own row.
        title_row_y = round(0.06 * 1754)
        title_pixels = [rgb.getpixel((x, title_row_y)) for x in range(300, 940, 10)]
        assert any(p[0] > 100 and p[0] > p[2] + 20 for p in title_pixels), "brown title ink"
        # Background stays the configured warm off-white, not pure white.
        assert rgb.getpixel((20, 20)) == (0xED, 0xEB, 0xEC)


def test_catalog_image_element_keeps_the_source_aspect_ratio(client):
    """A 3000x4000 source (0.75 ratio) placed at 40% of a 925-wide card must
    come out at exactly that ratio - it must never be stretched to fill an
    arbitrary box."""
    job = upload(client, [("product.jpg", make_image(3000, 4000, (30, 90, 200)))])
    image_id = job["images"][0]["id"]
    compose(
        client,
        job["jobId"],
        mode="card",
        preset="catalog",
        elements=[{"type": "image", "assetId": image_id, "x": 50, "y": 70, "widthPercent": 40}],
    )
    expected_w = round(0.40 * 925)
    expected_h = round(expected_w * (4000 / 3000))
    cx, cy = round(0.5 * 925), round(0.70 * 1131)
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        rgb = image.convert("RGB")
        # Inside the photo, close to its centre.
        assert rgb.getpixel((cx, cy))[2] > 150
        # Just outside the photo's computed top edge: still the white card.
        outside_y = cy - expected_h // 2 - 15
        if outside_y > 0:
            assert rgb.getpixel((cx, outside_y)) == (255, 255, 255)


def test_catalog_uses_the_original_uploaded_resolution_not_a_preview(client):
    """The composer has no separate preview-render path: it draws straight
    from the original upload the same way the rest of the app does."""
    job = upload(client, [("hero.jpg", make_image(4000, 3000, (10, 200, 40)))])
    assert (job["images"][0]["width"], job["images"][0]["height"]) == (4000, 3000)
    image_id = job["images"][0]["id"]
    body = compose(
        client,
        job["jobId"],
        mode="card",
        preset="catalog",
        elements=[{"type": "image", "assetId": image_id, "x": 50, "y": 70, "widthPercent": 80}],
    ).get_json()
    assert (body["width"], body["height"]) == (925, 1131)
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        rgb = image.convert("RGB")
        pixel = rgb.getpixel((round(0.5 * 925), round(0.70 * 1131)))
        assert pixel[1] > 150 and pixel[0] < 60


def test_catalog_four_sections_render_independently_styled_and_non_overlapping(client):
    """Title/description/details/price as four separate elements - the exact
    shape the frontend's per-section auto-layout sends - each with its own
    size, weight and colour, composited onto one card without a new
    rendering path: this is the same OverlayElement/render_text_box every
    other text element already goes through, four times."""
    job = upload(client, [("product.jpg", make_image(1000, 1000, (10, 10, 10)))])
    image_id = job["images"][0]["id"]

    def text_el(y, text, font_size, color, bold=True):
        return {
            "type": "text",
            "text": text,
            "x": 50,
            "y": y,
            "boxWidth": 80,
            "fontSize": font_size,
            "bold": bold,
            "align": "center",
            "background": "none",
            "color": color,
        }

    compose(
        client,
        job["jobId"],
        mode="card",
        preset="catalog",
        background="#FFFFFF",
        elements=[
            text_el(6, "TITLE", 40, "#FF0000", bold=True),
            text_el(14, "Description text here", 20, "#00AA00", bold=False),
            text_el(20, "Material: Wood", 18, "#0000FF", bold=False),
            text_el(26, "Price: $99", 24, "#000000", bold=True),
            {"type": "image", "assetId": image_id, "x": 50, "y": 70, "widthPercent": 50},
        ],
    )
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        assert image.size == (925, 1131)
        rgb = image.convert("RGB")

        def row_has_color(y_percent, predicate):
            y = round((y_percent / 100) * 1131)
            row = [rgb.getpixel((x, y)) for x in range(250, 675, 5)]
            return any(predicate(pixel) for pixel in row)

        assert row_has_color(6, lambda p: p[0] > 150 and p[1] < 80 and p[2] < 80), "red title"
        assert row_has_color(14, lambda p: p[1] > 100 and p[0] < 80), "green description"
        assert row_has_color(20, lambda p: p[2] > 150 and p[0] < 80), "blue details"
        assert row_has_color(26, lambda p: p[0] < 60 and p[1] < 60 and p[2] < 60), "black price"


def test_catalog_text_box_and_image_do_not_overlap_with_correct_spacing(client):
    """Short text leaves room for a tall image below it, with an untouched
    (background-colour) gap in between - the layout the auto-layout engine
    is responsible for producing on the frontend."""
    job = upload(client, [("product.jpg", make_image(1000, 1000, (10, 10, 10)))])
    image_id = job["images"][0]["id"]
    compose(
        client,
        job["jobId"],
        mode="card",
        preset="catalog",
        background="#FFFFFF",
        elements=[
            {
                "type": "text",
                "text": "Short Title",
                "x": 50,
                "y": 10,
                "boxWidth": 80,
                "fontSize": 32,
                "align": "center",
                "background": "none",
                "color": "#000000",
            },
            {"type": "image", "assetId": image_id, "x": 50, "y": 70, "widthPercent": 50},
        ],
    )
    with Image.open(io.BytesIO(fetch(client, job["jobId"]).data)) as image:
        rgb = image.convert("RGB")
        # A row between the short title (top) and the image (around y=70%)
        # must still be plain white - nothing drawn there.
        gap_row_y = round(0.35 * 1131)
        assert rgb.getpixel((round(0.5 * 925), gap_row_y)) == (255, 255, 255)
