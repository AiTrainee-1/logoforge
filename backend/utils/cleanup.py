"""Temporary directory janitor.

Railway gives us an ephemeral filesystem; user images must never outlive the
job that produced them.
"""
from __future__ import annotations

import logging
import shutil
import threading
import time
from pathlib import Path

log = logging.getLogger("logoforge")


def remove_tree(path: Path) -> None:
    try:
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
    except OSError:  # pragma: no cover - best effort
        log.warning("Could not remove %s", path)


def purge_expired(root: Path, ttl_seconds: int) -> int:
    """Delete job directories last touched longer ago than the TTL."""
    if not root.exists():
        return 0
    cutoff = time.time() - ttl_seconds
    removed = 0
    for child in root.iterdir():
        try:
            if child.is_dir() and child.stat().st_mtime < cutoff:
                remove_tree(child)
                removed += 1
        except OSError:  # pragma: no cover
            continue
    return removed


def start_janitor(root: Path, ttl_seconds: int, interval_seconds: int) -> threading.Thread:
    def _loop() -> None:
        while True:
            time.sleep(interval_seconds)
            try:
                count = purge_expired(root, ttl_seconds)
                if count:
                    log.info("Cleaned up %d expired job(s)", count)
            except Exception:  # pragma: no cover - never kill the thread
                log.exception("Janitor pass failed")

    thread = threading.Thread(target=_loop, name="logoforge-janitor", daemon=True)
    thread.start()
    return thread
