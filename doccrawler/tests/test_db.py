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


def test_conversation_and_messages_persist_in_order(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    conv_id = dbmod.create_conversation(conn)
    assert conv_id is not None

    conv = dbmod.get_conversation(conn, conv_id)
    assert conv["id"] == conv_id

    dbmod.add_message(conn, conv_id, "user", "What is the vacation policy?")
    dbmod.add_message(conn, conv_id, "assistant", "15 days per year.", provider="ollama")
    dbmod.add_message(conn, conv_id, "user", "And sick leave?")
    dbmod.add_message(conn, conv_id, "assistant", "10 days per year.", provider="anthropic")

    msgs = dbmod.list_messages(conn, conv_id)
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    assert [m["content"] for m in msgs] == [
        "What is the vacation policy?", "15 days per year.",
        "And sick leave?", "10 days per year.",
    ]
    assert msgs[1]["provider"] == "ollama"
    assert msgs[3]["provider"] == "anthropic"

    # Bounded history: limit=2 should return the last two, still oldest-first.
    last_two = dbmod.list_messages(conn, conv_id, limit=2)
    assert [m["content"] for m in last_two] == ["And sick leave?", "10 days per year."]
    conn.close()


def test_list_and_get_most_recent_conversation(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    c1 = dbmod.create_conversation(conn)
    c2 = dbmod.create_conversation(conn)
    dbmod.add_message(conn, c1, "user", "hello")

    convs = dbmod.list_conversations(conn)
    ids = {c["id"] for c in convs}
    assert ids == {c1, c2}

    most_recent = dbmod.get_most_recent_conversation(conn)
    # c1 has a message (more recent activity) so it should sort first.
    assert most_recent["id"] == c1

    assert dbmod.delete_conversation(conn, c2) is True
    assert dbmod.get_conversation(conn, c2) is None
    assert dbmod.delete_conversation(conn, 99999) is False
    conn.close()
