from doccrawler import db as dbmod


def _mk_doc(conn, name, text="hello world", file_hash=None):
    file_hash = file_hash or f"hash-{name}"
    return dbmod.insert_document(
        conn, path=f"/tmp/{name}", file_hash=file_hash, size=1,
        added_at="2024-01-01T00:00:00", mime_type="text/plain",
        source_name=name, text=text,
    )


def test_delete_document_removes_row_and_tags(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    doc_id = _mk_doc(conn, "a.txt")
    dbmod.tag_document(conn, doc_id, "important", auto=False)

    path = dbmod.delete_document(conn, doc_id)
    assert path == "/tmp/a.txt"
    assert dbmod.get_document(conn, doc_id) is None
    assert dbmod.count_documents(conn) == 0
    # document_tags row should be gone too (cascade)
    remaining = conn.execute("SELECT * FROM document_tags WHERE document_id = ?", (doc_id,)).fetchall()
    assert remaining == []
    conn.close()


def test_delete_document_missing_returns_none(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    assert dbmod.delete_document(conn, 999) is None
    conn.close()


def test_delete_tag(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    doc_id = _mk_doc(conn, "a.txt")
    dbmod.tag_document(conn, doc_id, "temp", auto=False)
    assert dbmod.delete_tag(conn, "temp") is True
    assert dbmod.tags_for_document(conn, doc_id) == []
    assert dbmod.delete_tag(conn, "nope") is False
    conn.close()


def test_rename_tag_simple(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    doc_id = _mk_doc(conn, "a.txt")
    dbmod.tag_document(conn, doc_id, "old", auto=False)
    assert dbmod.rename_tag(conn, "old", "new") is True
    names = {t["name"] for t in dbmod.tags_for_document(conn, doc_id)}
    assert names == {"new"}
    conn.close()


def test_rename_tag_merges_into_existing(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    doc_id = _mk_doc(conn, "a.txt")
    dbmod.tag_document(conn, doc_id, "old", auto=False)
    dbmod.tag_document(conn, doc_id, "existing", auto=False)
    assert dbmod.rename_tag(conn, "old", "existing") is True
    names = {t["name"] for t in dbmod.tags_for_document(conn, doc_id)}
    assert names == {"existing"}
    all_names = {t["name"] for t in dbmod.all_tags(conn)}
    assert "old" not in all_names
    conn.close()


def test_list_documents_with_tags_pagination(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    for i in range(5):
        doc_id = _mk_doc(conn, f"f{i}.txt", file_hash=f"h{i}")
        dbmod.tag_document(conn, doc_id, f"tag{i}", auto=True)

    page1 = dbmod.list_documents_with_tags(conn, limit=2, offset=0)
    page2 = dbmod.list_documents_with_tags(conn, limit=2, offset=2)
    assert len(page1) == 2
    assert len(page2) == 2
    assert {r["id"] for r in page1}.isdisjoint({r["id"] for r in page2})
    assert dbmod.count_documents(conn) == 5
    # tag_names should be populated for each row
    assert all(r["tag_names"] for r in page1)
    conn.close()


def test_search_fts_pagination_and_tags(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    for i in range(3):
        doc_id = _mk_doc(conn, f"f{i}.txt", text="apple banana cherry", file_hash=f"hh{i}")
        dbmod.tag_document(conn, doc_id, "fruit", auto=True)

    total = dbmod.count_search_fts(conn, "apple")
    assert total == 3
    page1 = dbmod.search_fts(conn, "apple", limit=2, offset=0)
    page2 = dbmod.search_fts(conn, "apple", limit=2, offset=2)
    assert len(page1) == 2
    assert len(page2) == 1
    assert page1[0]["tag_names"] == "fruit"
    conn.close()
