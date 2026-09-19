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

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    provider TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, id);
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


def list_documents_with_tags(conn: sqlite3.Connection, limit: int = 25, offset: int = 0) -> list:
    """Paginated document listing with each doc's tag names pre-joined
    (a single GROUP BY query) so the library page never does one query per
    row per document -- important once the corpus grows into the hundreds
    or thousands.
    """
    return conn.execute(
        """
        SELECT d.*, GROUP_CONCAT(t.name) AS tag_names
        FROM documents d
        LEFT JOIN document_tags dt ON dt.document_id = d.id
        LEFT JOIN tags t ON t.id = dt.tag_id
        GROUP BY d.id
        ORDER BY d.added_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    ).fetchall()


def count_documents(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT COUNT(*) AS c FROM documents").fetchone()["c"]


def delete_document(conn: sqlite3.Connection, doc_id: int) -> Optional[str]:
    """Delete a document row (cascades to document_tags and the FTS index
    via the schema's triggers/foreign keys). Returns the on-disk path that
    was recorded for it, or None if no such document existed, so the
    caller can decide whether to also remove the file from library/.
    """
    row = get_document(conn, doc_id)
    if row is None:
        return None
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    return row["path"]


def delete_tag(conn: sqlite3.Connection, tag_name: str) -> bool:
    """Remove a tag entirely (from every document it's attached to)."""
    name = tag_name.strip().lower()
    if not name:
        return False
    cur = conn.execute("DELETE FROM tags WHERE name = ?", (name,))
    conn.commit()
    return cur.rowcount > 0


def rename_tag(conn: sqlite3.Connection, old_name: str, new_name: str) -> bool:
    """Rename a tag. If a tag with the new name already exists, the two are
    merged (documents keep the union of both, old tag id is dropped).
    """
    old_name = old_name.strip().lower()
    new_name = new_name.strip().lower()
    if not old_name or not new_name or old_name == new_name:
        return False
    old_row = conn.execute("SELECT id FROM tags WHERE name = ?", (old_name,)).fetchone()
    if old_row is None:
        return False
    existing_new = conn.execute("SELECT id FROM tags WHERE name = ?", (new_name,)).fetchone()
    if existing_new is None:
        conn.execute("UPDATE tags SET name = ? WHERE id = ?", (new_name, old_row["id"]))
    else:
        # Merge: move document_tags rows to the existing target tag,
        # ignoring ones that would collide with a (doc, tag) pair that
        # already exists, then drop the now-orphaned old tag.
        rows = conn.execute(
            "SELECT document_id, auto FROM document_tags WHERE tag_id = ?", (old_row["id"],)
        ).fetchall()
        for r in rows:
            conn.execute(
                "INSERT OR IGNORE INTO document_tags (document_id, tag_id, auto) VALUES (?, ?, ?)",
                (r["document_id"], existing_new["id"], r["auto"]),
            )
        conn.execute("DELETE FROM tags WHERE id = ?", (old_row["id"],))
    conn.commit()
    return True


def _fts_match_expr(query: str) -> Optional[str]:
    """Build an FTS5 MATCH expression from free-form user text.

    Plain space-separated MATCH queries are an implicit AND of every term,
    which makes natural-language questions ("What is the budget for
    project apollo?") fail unless the document happens to contain every
    stopword too. Instead, tokenize and OR the meaningful terms together
    so any matching keyword can surface the document; bm25 ranking still
    favors documents that match more of them.
    """
    from .tagging import STOPWORDS, WORD_RE

    words = [w.lower() for w in WORD_RE.findall(query)]
    terms = [w for w in words if w not in STOPWORDS]
    if not terms:
        terms = words
    if not terms:
        return None
    quoted = ['"' + t.replace('"', '""') + '"' for t in terms]
    return " OR ".join(quoted)


def search_fts(conn: sqlite3.Connection, query: str, limit: int = 10, offset: int = 0) -> list:
    """Full text search using FTS5. Returns rows with document fields plus
    rank/snippet/tag_names.

    Falls back gracefully (returns []) on malformed FTS query syntax by
    escaping the query as a plain phrase.
    """
    def _run(q: str):
        # bm25()/snippet() must be evaluated directly against the FTS
        # virtual table without an aggregating GROUP BY in the same query
        # (sqlite raises "unable to use function bm25 in the requested
        # context" otherwise), so rank/snippet are computed in a subquery
        # and tag names are joined in separately.
        return conn.execute(
            """
            SELECT d.*, hits.rank AS rank, hits.snippet AS snippet, tg.tag_names AS tag_names
            FROM (
                SELECT documents_fts.rowid AS doc_id,
                       bm25(documents_fts) AS rank,
                       snippet(documents_fts, 1, '[', ']', ' ... ', 12) AS snippet
                FROM documents_fts
                WHERE documents_fts MATCH ?
                ORDER BY rank
                LIMIT ? OFFSET ?
            ) hits
            JOIN documents d ON d.id = hits.doc_id
            LEFT JOIN (
                SELECT dt.document_id AS document_id, GROUP_CONCAT(t.name) AS tag_names
                FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                GROUP BY dt.document_id
            ) tg ON tg.document_id = d.id
            ORDER BY hits.rank
            """,
            (q, limit, offset),
        ).fetchall()

    match_expr = _fts_match_expr(query)
    if match_expr is None:
        return []

    try:
        return _run(match_expr)
    except sqlite3.OperationalError:
        # Query wasn't valid FTS5 syntax (special chars etc). Retry as a
        # quoted phrase so users can search arbitrary text safely.
        safe = '"' + query.replace('"', '""') + '"'
        try:
            return _run(safe)
        except sqlite3.OperationalError as exc:
            log.warning("FTS query failed even when escaped: %s", exc)
            return []


def count_search_fts(conn: sqlite3.Connection, query: str) -> int:
    match_expr = _fts_match_expr(query)
    if match_expr is None:
        return 0

    def _count(q: str) -> int:
        return conn.execute(
            "SELECT COUNT(*) AS c FROM documents_fts WHERE documents_fts MATCH ?", (q,)
        ).fetchone()["c"]

    try:
        return _count(match_expr)
    except sqlite3.OperationalError:
        safe = '"' + query.replace('"', '""') + '"'
        try:
            return _count(safe)
        except sqlite3.OperationalError:
            return 0


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


def create_conversation(conn: sqlite3.Connection, title: Optional[str] = None) -> int:
    """Create a new conversation ("The Librarian" chat thread) and return its id."""
    import datetime
    created_at = datetime.datetime.utcnow().isoformat()
    cur = conn.execute(
        "INSERT INTO conversations (title, created_at) VALUES (?, ?)",
        (title, created_at),
    )
    conn.commit()
    return cur.lastrowid


def list_conversations(conn: sqlite3.Connection, limit: int = 50) -> list:
    """Most-recently-active conversations first (by their newest message, or
    creation time if no messages yet), each with a message count."""
    return conn.execute(
        """
        SELECT c.*, COUNT(m.id) AS message_count,
               COALESCE(MAX(m.created_at), c.created_at) AS last_active
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY last_active DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()


def get_conversation(conn: sqlite3.Connection, conversation_id: int) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
    ).fetchone()


def get_most_recent_conversation(conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    rows = list_conversations(conn, limit=1)
    return rows[0] if rows else None


def list_messages(conn: sqlite3.Connection, conversation_id: int, limit: Optional[int] = None) -> list:
    """All messages in a conversation, oldest first. With `limit`, returns
    only the most recent `limit` messages (still oldest-first order)."""
    if limit is None:
        return conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC",
            (conversation_id,),
        ).fetchall()
    rows = conn.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?",
        (conversation_id, limit),
    ).fetchall()
    return list(reversed(rows))


def add_message(
    conn: sqlite3.Connection,
    conversation_id: int,
    role: str,
    content: str,
    provider: Optional[str] = None,
) -> int:
    import datetime
    if role not in ("user", "assistant"):
        raise ValueError(f"Invalid message role: {role!r}")
    created_at = datetime.datetime.utcnow().isoformat()
    cur = conn.execute(
        """INSERT INTO messages (conversation_id, role, content, provider, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        (conversation_id, role, content, provider, created_at),
    )
    conn.commit()
    return cur.lastrowid


def delete_conversation(conn: sqlite3.Connection, conversation_id: int) -> bool:
    cur = conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    return cur.rowcount > 0


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
