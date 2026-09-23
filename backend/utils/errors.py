"""Uniform API error handling.

Every failure leaves the API in the shape documented in the spec::

    {"success": false, "error": {"code": "...", "message": "..."}}

Python tracebacks are never sent to the client.
"""
from __future__ import annotations

import logging
import uuid

from flask import jsonify
from werkzeug.exceptions import HTTPException

log = logging.getLogger("logoforge")


class ApiError(Exception):
    """An error that is safe to show to the user."""

    def __init__(self, code: str, message: str, status: int = 400, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details

    def to_dict(self) -> dict:
        payload = {"success": False, "error": {"code": self.code, "message": self.message}}
        if self.details:
            payload["error"]["details"] = self.details
        return payload


def error_response(code: str, message: str, status: int = 400, details=None):
    return jsonify(ApiError(code, message, status, details).to_dict()), status


def register_error_handlers(app) -> None:
    @app.errorhandler(ApiError)
    def _api_error(err: ApiError):
        return jsonify(err.to_dict()), err.status

    @app.errorhandler(413)
    def _too_large(_err):
        return error_response(
            "PAYLOAD_TOO_LARGE",
            "The upload is larger than the server allows. Try fewer or smaller files.",
            413,
        )

    @app.errorhandler(404)
    def _not_found(_err):
        return error_response("NOT_FOUND", "The requested resource does not exist.", 404)

    @app.errorhandler(HTTPException)
    def _http_error(err: HTTPException):
        return error_response(
            "HTTP_ERROR",
            err.description or "The request could not be completed.",
            err.code or 500,
        )

    @app.errorhandler(Exception)
    def _unexpected(err: Exception):
        incident = uuid.uuid4().hex[:8]
        log.exception("Unhandled error [%s]", incident, exc_info=err)
        return error_response(
            "INTERNAL_ERROR",
            "Something went wrong while handling the request (ref %s)." % incident,
            500,
        )
