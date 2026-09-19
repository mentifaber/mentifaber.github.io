from doccrawler import db as dbmod


def test_connect_creates_schema(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    tables = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table','view')"
    ).fetchall()}
    assert "documents" in tables
    assert "tags" in tables
    assert "document_tags" in tables
    assert "documents_fts" in tables
    conn.close()


def test_insert_and_get_document(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    doc_id = dbmod.insert_document(
        conn, path="/tmp/foo.txt", file_hash="abc123", size=10,
        added_at="2024-01-01T00:00:00", mime_type="text/plain",
        source_name="foo.txt", text="hello world",
    )
    assert doc_id is not None
    doc = dbmod.get_document(conn, doc_id)
    assert doc["source_name"] == "foo.txt"
    assert dbmod.get_document_by_hash(conn, "abc123")["id"] == doc_id
    assert dbmod.count_documents(conn) == 1
    conn.close()


def test_tagging(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    doc_id = dbmod.insert_document(
        conn, path="/tmp/foo.txt", file_hash="h1", size=1,
        added_at="2024-01-01T00:00:00", mime_type="text/plain",
        source_name="foo.txt", text="hello",
    )
    dbmod.tag_document(conn, doc_id, "Important", auto=False)
    dbmod.tag_document(conn, doc_id, "receipt", auto=True)
    tags = dbmod.tags_for_document(conn, doc_id)
    names = {t["name"] for t in tags}
    assert names == {"important", "receipt"}

    docs = dbmod.documents_for_tag(conn, "important")
    assert len(docs) == 1
    assert docs[0]["id"] == doc_id

    dbmod.untag_document(conn, doc_id, "important")
    tags_after = {t["name"] for t in dbmod.tags_for_document(conn, doc_id)}
    assert tags_after == {"receipt"}
    conn.close()
