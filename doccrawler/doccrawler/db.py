"""SQLite database layer for DocCrawler.

Schema:
  documents(id, path, hash, size, added_at, mime_type, source_name, text)
  documents_fts(text, filename)  -- FTS5 virtual table, content-linked to documents
  tags(id, name)
  document_tags(document_id, tag_id)

FTS5 ships with the standard CPython sqlite3 build on virtually all modern
platforms including Termux, so we depend on it directly. If it is somehow
unavailable we raise a clear RuntimeError rather than silently degrading,
since full-text search is a core feature.
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Iterable, Optional

log = logging.getLogger("doccrawler.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    hash TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL,
    added_at TEXT NOT NULL,
    mime_type TEXT,
    source_name TEXT,
    text TEXT,
    ocr_used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS document_tags (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    auto INTEGER DEFAULT 0,
    PRIMARY KEY (document_id, tag_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    filename, text
);

CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, filename, text)
    VALUES (new.id, new.source_name, new.text);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    DELETE FROM documents_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    DELETE FROM documents_fts WHERE rowid = old.id;
    INSERT INTO documents_fts(rowid, filename, text)
    VALUES (new.id, new.source_name, new.text);
END;
"""


def connect(db_path: Path) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.executescript(SCHEMA)
    except sqlite3.OperationalError as exc:
        if "fts5" in str(exc).lower():
            raise RuntimeError(
                "This Python's sqlite3 build lacks FTS5 support, which DocCrawler "
                "requires for full-text search. Most Termux/desktop Python builds "
                "include it; consider upgrading Python or rebuilding sqlite3."
            ) from exc
        raise
    conn.commit()
    return conn


def insert_document(
    conn: sqlite3.Connection,
    *,
    path: str,
    file_hash: str,
    size: int,
    added_at: str,
    mime_type: str,
    source_name: str,
    text: str,
    ocr_used: bool = False,
) -> int:
    cur = conn.execute(
        """INSERT INTO documents (path, hash, size, added_at, mime_type, source_name, text, ocr_used)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (path, file_hash, size, added_at, mime_type, source_name, text, int(ocr_used)),
    )
    conn.commit()
    return cur.lastrowid


def get_document_by_hash(conn: sqlite3.Connection, file_hash: str) -> Optional[sqlite3.Row]:
    return conn.execute("SELECT * FROM documents WHERE hash = ?", (file_hash,)).fetchone()


def get_document(conn: sqlite3.Connection, doc_id: int) -> Optional[sqlite3.Row]:
    return conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()


def list_documents(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> list:
    return conn.execute(
        "SELECT * FROM documents ORDER BY added_at DESC LIMIT ? OFFSET ?", (limit, offset)
    ).fetchall()


def count_documents(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT COUNT(*) AS c FROM documents").fetchone()["c"]


def search_fts(conn: sqlite3.Connection, query: str, limit: int = 10) -> list:
    """Full text search using FTS5. Returns rows with document fields plus rank/snippet.

    Falls back gracefully (returns []) on malformed FTS query syntax by
    escaping the query as a plain phrase.
    """
    def _run(q: str):
        return conn.execute(
            """
            SELECT d.*, bm25(documents_fts) AS rank,
                   snippet(documents_fts, 1, '[', ']', ' ... ', 12) AS snippet
            FROM documents_fts
            JOIN documents d ON d.id = documents_fts.rowid
            WHERE documents_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (q, limit),
        ).fetchall()

    try:
        return _run(query)
    except sqlite3.OperationalError:
        # Query wasn't valid FTS5 syntax (special chars etc). Retry as a
        # quoted phrase so users can search arbitrary text safely.
        safe = '"' + query.replace('"', '""') + '"'
        try:
            return _run(safe)
        except sqlite3.OperationalError as exc:
            log.warning("FTS query failed even when escaped: %s", exc)
            return []


def add_tag(conn: sqlite3.Connection, name: str) -> int:
    name = name.strip().lower()
    conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (name,))
    conn.commit()
    row = conn.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()
    return row["id"]


def tag_document(conn: sqlite3.Connection, doc_id: int, tag_name: str, auto: bool = False) -> None:
    tag_id = add_tag(conn, tag_name)
    conn.execute(
        "INSERT OR IGNORE INTO document_tags (document_id, tag_id, auto) VALUES (?, ?, ?)",
        (doc_id, tag_id, int(auto)),
    )
    conn.commit()


def untag_document(conn: sqlite3.Connection, doc_id: int, tag_name: str) -> None:
    conn.execute(
        """DELETE FROM document_tags WHERE document_id = ? AND tag_id = (
               SELECT id FROM tags WHERE name = ?)""",
        (doc_id, tag_name.strip().lower()),
    )
    conn.commit()


def tags_for_document(conn: sqlite3.Connection, doc_id: int) -> list:
    return conn.execute(
        """SELECT t.name, dt.auto FROM tags t
           JOIN document_tags dt ON dt.tag_id = t.id
           WHERE dt.document_id = ? ORDER BY t.name""",
        (doc_id,),
    ).fetchall()


def all_tags(conn: sqlite3.Connection) -> list:
    return conn.execute(
        """SELECT t.name, COUNT(dt.document_id) AS n FROM tags t
           LEFT JOIN document_tags dt ON dt.tag_id = t.id
           GROUP BY t.id ORDER BY n DESC, t.name"""
    ).fetchall()


def documents_for_tag(conn: sqlite3.Connection, tag_name: str) -> list:
    return conn.execute(
        """SELECT d.* FROM documents d
           JOIN document_tags dt ON dt.document_id = d.id
           JOIN tags t ON t.id = dt.tag_id
           WHERE t.name = ? ORDER BY d.added_at DESC""",
        (tag_name.strip().lower(),),
    ).fetchall()


def stats(conn: sqlite3.Connection) -> dict:
    doc_count = count_documents(conn)
    tag_count = conn.execute("SELECT COUNT(*) AS c FROM tags").fetchone()["c"]
    total_size = conn.execute("SELECT COALESCE(SUM(size), 0) AS s FROM documents").fetchone()["s"]
    by_type = conn.execute(
        "SELECT mime_type, COUNT(*) AS c FROM documents GROUP BY mime_type ORDER BY c DESC"
    ).fetchall()
    return {
        "doc_count": doc_count,
        "tag_count": tag_count,
        "total_size": total_size,
        "by_type": [dict(r) for r in by_type],
    }
