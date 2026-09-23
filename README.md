# LogoForge

Batch image branding with Figma/Canva-style positioning.

Upload many images and one logo, position each photo independently inside its
export frame, get automatic `A`, `B`, `C` … labels burned into the output, and
download the results individually or as a ZIP — **without losing the quality or
the resolution of what you uploaded**.

```
React + Vite + TypeScript          Python + Flask
        │                                │
        │  REST (multipart + JSON)       ├── Pillow  (decode / place / encode)
        └───────────────────────────────►├── Transform engine
                                         ├── Logo compositor
                                         ├── Label renderer
                                         └── zipfile (ZIP_STORED)
                                                   │
                                            processed files
                                                   │
                                     individual download  +  ZIP
```

---

## What is in the box

| Path        | What it is                                              |
| ----------- | ------------------------------------------------------- |
| `backend/`  | Flask API, image processing engine, tests, Railway files |
| `frontend/` | React + Vite + TypeScript + Tailwind editor              |

---

## Quick start

Two terminals.

**1 — API** (http://localhost:5000)

```bash
cd backend && python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt && cp .env.example .env && .venv/Scripts/python.exe app.py
```

On macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python.exe`.

**2 — Editor** (http://localhost:5173)

```bash
cd frontend && npm install && cp .env.example .env && npm run dev
```

Then open http://localhost:5173.

---

## The quality contract

This is the reason the app exists, so it is enforced in code and covered by
tests (`backend/tests/test_quality.py`).

| Rule                                                                         | Where                                 |
| ---------------------------------------------------------------------------- | ------------------------------------- |
| `Original` export keeps the source's exact pixel dimensions                   | `transform_service.compute_frame`     |
| Nothing is resized unless the user picks an Instagram preset or scales/crops  | `image_processor.render`              |
| The source is decoded once and encoded once — never re-compressed in between  | `image_processor.render`              |
| Only the visible region is resampled, once, with Lanczos                      | `image_processor.draw_source`         |
| A render with nothing to draw copies the original bytes verbatim              | `image_processor.render` (passthrough) |
| JPEG → JPEG, PNG → PNG, WebP → WebP; PNG/WebP stay lossless                   | `image_processor.FORMAT_MAP/encode`   |
| JPEG is written at quality 100 with 4:4:4 chroma (no subsampling loss)        | `image_processor.encode`              |
| ICC profile, EXIF and DPI are carried over where the container supports them  | `image_processor.encode`              |
| Transparency is never flattened unnecessarily                                 | `image_processor.render`              |
| The ZIP packages the finished files with `ZIP_STORED` — no recompression      | `zip_service.build_zip`               |
| Final rendering always reads the original upload, never the browser preview   | `job_store.source_path`               |

JPEG is lossy by definition: information the camera or the original encoder
already discarded cannot be restored. What the app guarantees is that it adds
no further generation loss than one maximum-quality re-encode.

---

## The transform model

The preview and the exported file use **the same maths**. The Python module and
the TypeScript module are line-by-line ports of each other:

- `backend/services/transform_service.py`
- `frontend/src/utils/transforms.ts`

```
output frame   original  -> the source image's own dimensions
               preset    -> 1080×1350 | 1080×1080 | 1080×566

placement      baseScale  = cover (or contain) the frame
               effective  = baseScale × transform.scale
               x          = (frameW − drawnW)/2 + offsetX% × frameW
               y          = (frameH − drawnH)/2 + offsetY% × frameH
```

Offsets are **percentages of the frame**, so the same three numbers describe a
480 px preview and a 4000 px export. Logo margin, label size and label margin
are authored in pixels against a 1080 px reference width and scale with the
output (`30px` at 1080 → `111px` at 4000).

Each image owns its `{ scale, offsetX, offsetY }`. Editing image A never
touches image B; "Apply to all" is an explicit button.

Render order is fixed so the branding never drifts with the photo:

```
frame → image (scale + offset, cropped to frame) → logo → character label → encode
```

---

## API

Base path `/api`. Errors always come back as
`{"success": false, "error": {"code": "...", "message": "..."}}` — never a
traceback.

| Method   | Route                             | Purpose                                     |
| -------- | --------------------------------- | ------------------------------------------- |
| `GET`    | `/health`                         | `{"status":"ok","service":"logoforge-api"}` |
| `GET`    | `/capabilities`                   | limits, accepted formats, export presets    |
| `POST`   | `/jobs`                           | create a session, optionally with files     |
| `GET`    | `/jobs/<id>`                      | status + progress + results                 |
| `DELETE` | `/jobs/<id>`                      | delete the session and every file in it     |
| `POST`   | `/jobs/<id>/images`               | add more images                             |
| `DELETE` | `/jobs/<id>/images/<imageId>`     | remove one image                            |
| `POST`   | `/jobs/<id>/logo`                 | upload / replace the logo                   |
| `DELETE` | `/jobs/<id>/logo`                 | remove the logo                             |
| `POST`   | `/jobs/<id>/process`              | render the batch (`{"sync": true}` to wait) |
| `GET`    | `/jobs/<id>/results`              | per-image results + download URLs           |
| `GET`    | `/jobs/<id>/files/<imageId>`      | download one processed image                |
| `GET`    | `/jobs/<id>/zip`                  | download every processed image as a ZIP     |

Compatibility aliases from the original brief also exist: `POST /api/upload`,
`POST /api/process`, `POST /api/process-batch`, `POST /api/create-zip`.

A processing request body:

```json
{
  "order": ["img1", "img2"],
  "transforms": { "img1": { "scale": 1.25, "offsetX": -20, "offsetY": 15 } },
  "logo": { "position": "top-right", "sizePercent": 12, "margin": 30, "opacity": 100, "rotation": 0 },
  "character": { "enabled": true, "fontSize": 36, "color": "#FFFFFF", "opacity": 100, "bottomMargin": 30 },
  "export": { "format": "original", "quality": 100 }
}
```

Labels are **not** sent by the client: the server derives `A`, `B`, `C` … from
`order`, so reordering always renumbers correctly.

---

## Editor shortcuts

| Keys                   | Action                        |
| ---------------------- | ----------------------------- |
| `←` / `→`              | previous / next image         |
| `↑` / `↓`              | nudge the image up / down     |
| `Shift` + arrows       | nudge in any direction, fast  |
| `+` / `−`              | image scale                   |
| `R`                    | reset this image's position   |
| `B` / `F`              | before-after / fullscreen     |
| `Ctrl`/`⌘` + `Z`       | undo (`+ Shift` to redo)      |

Mouse: drag to reposition, wheel to scale, double-click to reset. On touch,
pinch to scale. The `−  100%  +` control above the canvas is the **view** zoom
and never affects the export.

---

## Tests

```bash
cd backend && .venv/Scripts/python.exe -m pytest
```

98 tests covering the transform maths, logo anchoring, label generation
(`A`…`Z`, `AA`, `AB`, `ZZ`, `AAA`), every export preset, format and dimension
preservation, the passthrough path, error shapes, path-traversal rejection and
ZIP/individual byte equality.

```bash
cd frontend && npx tsc -b && npm run lint && npm run build
```

---

## Deployment

### Backend → Railway

1. Point a Railway service at `backend/`.
2. `railway.json` and `nixpacks.toml` are picked up automatically: Nixpacks
   installs `fonts-dejavu-core` (so the label has a real bold face), the health
   check hits `/api/health`, and the start command is

   ```
   gunicorn 'app:create_app()' --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 300
   ```

   A `Procfile` with the same command is there for buildpack-style platforms.
3. Set the variables (see `backend/.env.example`). The only required one is
   `FRONTEND_URL` — a comma separated list of the origins allowed to call the
   API. Nothing about the deployment is hard-coded.

Threads rather than processes are used on purpose: job state lives on the
container's temporary filesystem, and one worker keeps a session on one box.
Scale by making the container bigger, or introduce shared storage before adding
workers.

### Frontend → Vercel / Netlify / any static host

```bash
cd frontend && npm run build   # -> frontend/dist
```

Set `VITE_API_URL` to the deployed API origin at build time.

---

## Privacy

Your images stay yours. Every session gets its own throw-away directory under
`TEMP_DIR`, it is deleted when you press Reset, and a janitor thread removes
anything older than `JOB_TTL_SECONDS` (2 hours by default). There is no
database and nothing is stored permanently.

---

## Known limits

- **Animated GIFs** lose their animation: compositing a logo onto every frame is
  out of scope, so the first frame is written as a PNG. The result says so.
- **HEIC/HEIF and AVIF** need `pillow-heif`
  (`pip install -r requirements-optional.txt`). Without it those uploads are
  rejected with a clear message rather than a confusing decode error, and
  `/api/capabilities` leaves them out of the accepted list.
- **The preview font** is the browser's bold sans-serif while the export uses
  the server's; the size, weight and position match, the glyph shapes can
  differ very slightly. Drop a TTF into `backend/assets/fonts/` to pin it.
