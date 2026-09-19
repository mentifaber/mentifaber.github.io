"""Ingestion: scanning folders, hashing/deduping, organizing into library/,
and recording extracted text + auto-tags into the database.
"""
from __future__ import annotations

import hashlib
import logging
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from . import db as dbmod
from .extract import extract_text, guess_mime_type, is_supported
from .tagging import auto_tags

log = logging.getLogger("doccrawler.ingest")

CHUNK_SIZE = 1024 * 1024


@dataclass
class IngestResult:
    added: int = 0
    duplicates: int = 0
    skipped: int = 0
    errors: int = 0


def hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _dest_path(library_dir: Path, source: Path, file_hash: str, organize_by: str) -> Path:
    ext = source.suffix.lower()
    if organize_by == "hash":
        sub = Path(file_hash[:2]) / file_hash[2:4]
    else:  # date
        now = datetime.now()
        sub = Path(f"{now.year:04d}") / f"{now.month:02d}"
    dest_dir = library_dir / sub
    dest_dir.mkdir(parents=True, exist_ok=True)
    return dest_dir / f"{file_hash[:16]}{ext}"


DEFAULT_MAX_FILE_MB = 200


def ingest_file(
    conn: sqlite3.Connection,
    source: Path,
    library_dir: Path,
    *,
    organize_by: str = "date",
    move: bool = False,
    max_file_mb: int = DEFAULT_MAX_FILE_MB,
) -> Optional[int]:
    """Ingest a single file. Returns the new document id, or None if it was a
    duplicate, unsupported, too large, or failed. Never raises for a single
    bad file.
    """
    source = Path(source)
    if not source.is_file():
        log.warning("Not a file, skipping: %s", source)
        return None
    if not is_supported(source):
        log.info("Skipping unsupported file type: %s", source)
        return None

    try:
        size_bytes = source.stat().st_size
    except OSError as exc:
        log.error("Could not stat %s: %s", source, exc)
        return None
    max_bytes = max_file_mb * 1024 * 1024
    if max_file_mb and size_bytes > max_bytes:
        log.warning(
            "Skipping %s: %.1f MB exceeds the configured max_file_mb=%s "
            "(set DOCCRAWLER_MAX_FILE_MB to change this)",
            source, size_bytes / 1024 / 1024, max_file_mb,
        )
        return None

    try:
        file_hash = hash_file(source)
    except Exception as exc:
        log.error("Could not hash %s: %s", source, exc)
        return None

    existing = dbmod.get_document_by_hash(conn, file_hash)
    if existing is not None:
        log.info("Duplicate (already in library), skipping copy: %s", source)
        return None

    dest = _dest_path(library_dir, source, file_hash, organize_by)
    try:
        if dest.exists():
            # Hash collision on filename target shouldn't happen given hash
            # naming, but guard anyway.
            pass
        else:
            if move:
                shutil.move(str(source), str(dest))
            else:
                shutil.copy2(str(source), str(dest))
    except Exception as exc:
        log.error("Could not copy/move %s to library: %s", source, exc)
        return None

    text, ocr_used = extract_text(dest)
    mime_type = guess_mime_type(dest)
    size = dest.stat().st_size
    added_at = datetime.now(timezone.utc).isoformat()

    try:
        doc_id = dbmod.insert_document(
            conn,
            path=str(dest),
            file_hash=file_hash,
            size=size,
            added_at=added_at,
            mime_type=mime_type,
            source_name=source.name,
            text=text,
            ocr_used=ocr_used,
        )
    except sqlite3.IntegrityError as exc:
        log.warning("Document already exists in DB (race or path clash): %s", exc)
        return None

    if text.strip():
        for tag in auto_tags(text):
            dbmod.tag_document(conn, doc_id, tag, auto=True)

    log.info("Ingested %s -> %s (id=%s, %d bytes, ocr=%s)", source, dest, doc_id, size, ocr_used)
    return doc_id


def scan_folder(
    conn: sqlite3.Connection,
    folder: Path,
    library_dir: Path,
    *,
    organize_by: str = "date",
    move: bool = False,
    recursive: bool = True,
    max_file_mb: int = DEFAULT_MAX_FILE_MB,
) -> IngestResult:
    folder = Path(folder)
    result = IngestResult()
    if not folder.exists():
        log.error("Watch/scan folder does not exist: %s", folder)
        return result

    pattern = "**/*" if recursive else "*"
    for path in sorted(folder.glob(pattern)):
        if not path.is_file():
            continue
        # Never re-ingest files that already live inside the library dir.
        try:
            path.resolve().relative_to(library_dir.resolve())
            continue
        except ValueError:
            pass
        if not is_supported(path):
            result.skipped += 1
            continue
        try:
            size_bytes = path.stat().st_size
        except OSError:
            size_bytes = 0
        if max_file_mb and size_bytes > max_file_mb * 1024 * 1024:
            log.warning("Skipping oversize file (%.1f MB): %s", size_bytes / 1024 / 1024, path)
            result.skipped += 1
            continue
        try:
            doc_id = ingest_file(
                conn, path, library_dir, organize_by=organize_by, move=move,
                max_file_mb=max_file_mb,
            )
        except Exception as exc:  # pragma: no cover - defensive
            log.error("Unexpected error ingesting %s: %s", path, exc)
            result.errors += 1
            continue
        if doc_id is None:
            result.duplicates += 1
        else:
            result.added += 1

    log.info(
        "Scan of %s complete: added=%d duplicates=%d skipped=%d errors=%d",
        folder, result.added, result.duplicates, result.skipped, result.errors,
    )
    return result
