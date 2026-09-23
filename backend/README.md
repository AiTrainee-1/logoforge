# LogoForge API

Flask + Pillow image branding service. See the [root README](../README.md) for
the architecture, the quality contract and the transform model.

## Layout

```
backend/
├── app.py                     application factory + CORS + error handlers
├── config.py                  everything configurable, all from the environment
├── requirements.txt           Flask, Flask-Cors, Pillow, python-dotenv, gunicorn
├── requirements-optional.txt  pillow-heif (HEIC/HEIF), pytest
├── Procfile / railway.json / nixpacks.toml
│
├── routes/
│   ├── health.py              /api/health, /api/capabilities
│   ├── processing.py          job lifecycle, uploads, rendering
│   └── downloads.py           individual files and the ZIP
│
├── services/
│   ├── transform_service.py   the shared placement maths (ported to TS)
│   ├── image_processor.py     decode -> place -> composite -> encode
│   ├── logo_processor.py      logo geometry and compositing
│   ├── label_service.py       the A/B/C character label
│   ├── zip_service.py         validation + ZIP_STORED packaging
│   └── job_store.py           session storage and batch orchestration
│
├── utils/
│   ├── filenames.py           sanitising, branded names, alphabetic labels
│   ├── validation.py          extensions, real format, size, bomb guard
│   ├── codecs.py              optional HEIC/AVIF plugins
│   ├── fonts.py               label font resolution
│   ├── cleanup.py             temp directory janitor
│   └── errors.py              the uniform error envelope
│
└── tests/                     98 tests
```

## Run

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # bin/python on macOS/Linux
cp .env.example .env
.venv/Scripts/python.exe app.py                               # http://localhost:5000
```

Production:

```bash
gunicorn "app:create_app()" --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 300
```

## Tests

```bash
.venv/Scripts/python.exe -m pip install pytest
.venv/Scripts/python.exe -m pytest
```

## Storage

```
<TEMP_DIR>/<job-id>/
    meta.json      uploaded originals + logo metadata
    status.json    progress and per-image results
    source/        the untouched uploads (always the render source)
    logo/          the uploaded logo
    output/        rendered files, and what the ZIP packages
```

Deleted on `DELETE /api/jobs/<id>` and by the janitor after
`JOB_TTL_SECONDS`.

## Security

- Extension allow-list **and** header inspection — the client's filename and
  MIME type are never trusted.
- Per-file and per-request size limits; `Image.MAX_IMAGE_PIXELS` guards against
  decompression bombs.
- Filenames are sanitised (path components, control characters, Windows device
  names); stored names are server-generated UUIDs.
- Every id used to build a path is validated against `^[a-f0-9]{8,32}$` and the
  resolved path must stay inside `TEMP_DIR`.
- CORS is restricted to `FRONTEND_URL`.
- No stack traces ever reach the client.
