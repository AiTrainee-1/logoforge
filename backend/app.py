"""LogoForge API - Flask application factory.

Run locally::

    python app.py

Run in production (Railway)::

    gunicorn "app:create_app()" --bind 0.0.0.0:$PORT
"""
from __future__ import annotations

import logging
import os

from flask import Flask, jsonify
from flask_cors import CORS

from config import config
from routes.compose import bp as compose_bp
from routes.downloads import bp as downloads_bp
from routes.fonts import bp as fonts_bp
from routes.health import bp as health_bp
from routes.processing import bp as processing_bp
from utils.cleanup import purge_expired, start_janitor
from utils.errors import register_error_handlers

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("logoforge")


def create_app(start_background_jobs: bool = True) -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH
    app.config["JSON_SORT_KEYS"] = False
    app.url_map.strict_slashes = False

    # Only the configured frontend may call the API from a browser.
    CORS(
        app,
        resources={r"/api/*": {"origins": config.FRONTEND_URL}},
        methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
        expose_headers=["Content-Disposition"],
        max_age=86400,
    )

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(processing_bp, url_prefix="/api")
    app.register_blueprint(downloads_bp, url_prefix="/api")
    app.register_blueprint(compose_bp, url_prefix="/api")
    app.register_blueprint(fonts_bp, url_prefix="/api")
    register_error_handlers(app)

    @app.get("/")
    def index():
        return jsonify(
            {
                "service": config.SERVICE_NAME,
                "status": "ok",
                "docs": "/api/capabilities",
            }
        )

    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    if start_background_jobs:
        # Clear anything a previous container left behind, then keep tidying.
        purge_expired(config.TEMP_DIR, config.JOB_TTL_SECONDS)
        start_janitor(
            config.TEMP_DIR, config.JOB_TTL_SECONDS, config.CLEANUP_INTERVAL_SECONDS
        )

    log.info(
        "LogoForge API ready (temp=%s, workers=%d, max %d images @ %d MB)",
        config.TEMP_DIR,
        config.WORKERS,
        config.MAX_IMAGES,
        config.MAX_FILE_SIZE_MB,
    )
    return app


app = create_app()


if __name__ == "__main__":
    # Development server only - production uses gunicorn (see Procfile).
    app.run(host="0.0.0.0", port=config.PORT, debug=os.getenv("FLASK_DEBUG") == "1")
