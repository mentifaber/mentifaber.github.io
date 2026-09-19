from pathlib import Path

import pytest

from doccrawler import db as dbmod
from doccrawler.config import Config
from doccrawler.ingest import ingest_file
from doccrawler.web import create_app


@pytest.fixture
def app_and_cfg(tmp_path):
    cfg = Config(home=tmp_path / "home")
    cfg.ensure_dirs()
    app = create_app(cfg)
    app.testing = True
    return app, cfg


def test_library_pagination(app_and_cfg):
    app, cfg = app_and_cfg
    conn = dbmod.connect(cfg.db_path)
    for i in range(3):
        src = cfg.watch_dir / f"doc{i}.txt"
        src.write_text(f"content number {i}")
        ingest_file(conn, src, cfg.library_dir)
    conn.close()

    client = app.test_client()
    cfg.library_page_size = 2
    resp = client.get("/library?page=1")
    assert resp.status_code == 200
    resp2 = client.get("/library?page=2")
    assert resp2.status_code == 200
    # Out of range page should clamp, not error
    resp3 = client.get("/library?page=999")
    assert resp3.status_code == 200


def test_delete_document_route(app_and_cfg):
    app, cfg = app_and_cfg
    conn = dbmod.connect(cfg.db_path)
    src = cfg.watch_dir / "todelete.txt"
    src.write_text("delete me please")
    doc_id = ingest_file(conn, src, cfg.library_dir)
    doc = dbmod.get_document(conn, doc_id)
    file_path = Path(doc["path"])
    conn.close()
    assert file_path.exists()

    client = app.test_client()
    resp = client.post(f"/doc/{doc_id}/delete", data={"delete_file": "on"}, follow_redirects=True)
    assert resp.status_code == 200

    conn = dbmod.connect(cfg.db_path)
    assert dbmod.get_document(conn, doc_id) is None
    conn.close()
    assert not file_path.exists()


def test_delete_document_keeps_file_by_default(app_and_cfg):
    app, cfg = app_and_cfg
    conn = dbmod.connect(cfg.db_path)
    src = cfg.watch_dir / "keepme.txt"
    src.write_text("keep me")
    doc_id = ingest_file(conn, src, cfg.library_dir)
    doc = dbmod.get_document(conn, doc_id)
    file_path = Path(doc["path"])
    conn.close()

    client = app.test_client()
    client.post(f"/doc/{doc_id}/delete", data={}, follow_redirects=True)
    assert file_path.exists()  # not deleted, since delete_file wasn't checked


def test_download_route_rejects_path_outside_library(app_and_cfg):
    app, cfg = app_and_cfg
    conn = dbmod.connect(cfg.db_path)
    # Simulate a tampered/malicious DB row pointing outside the library dir.
    doc_id = dbmod.insert_document(
        conn, path="/etc/passwd", file_hash="evilhash", size=1,
        added_at="2024-01-01T00:00:00", mime_type="text/plain",
        source_name="../../etc/passwd", text="",
    )
    conn.close()

    client = app.test_client()
    resp = client.get(f"/doc/{doc_id}/download")
    assert resp.status_code == 400


def test_download_route_404_for_missing_doc(app_and_cfg):
    app, cfg = app_and_cfg
    client = app.test_client()
    resp = client.get("/doc/99999/download")
    assert resp.status_code == 404


def test_download_route_serves_real_file(app_and_cfg):
    app, cfg = app_and_cfg
    conn = dbmod.connect(cfg.db_path)
    src = cfg.watch_dir / "real.txt"
    src.write_text("real content")
    doc_id = ingest_file(conn, src, cfg.library_dir)
    conn.close()

    client = app.test_client()
    resp = client.get(f"/doc/{doc_id}/download")
    assert resp.status_code == 200
    assert b"real content" in resp.data


def test_delete_and_rename_tag_routes(app_and_cfg):
    app, cfg = app_and_cfg
    conn = dbmod.connect(cfg.db_path)
    src = cfg.watch_dir / "tagme.txt"
    src.write_text("tag content")
    doc_id = ingest_file(conn, src, cfg.library_dir)
    dbmod.tag_document(conn, doc_id, "oldtag", auto=False)
    conn.close()

    client = app.test_client()
    resp = client.post("/tags/rename", data={"old": "oldtag", "new": "newtag"}, follow_redirects=True)
    assert resp.status_code == 200
    conn = dbmod.connect(cfg.db_path)
    names = {t["name"] for t in dbmod.tags_for_document(conn, doc_id)}
    assert "newtag" in names
    assert "oldtag" not in names
    conn.close()

    resp = client.post("/tags/delete", data={"tag": "newtag"}, follow_redirects=True)
    assert resp.status_code == 200
    conn = dbmod.connect(cfg.db_path)
    names_after = {t["name"] for t in dbmod.tags_for_document(conn, doc_id)}
    assert "newtag" not in names_after
    conn.close()


def test_ingest_skips_oversize_file(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    library_dir = tmp_path / "library"
    library_dir.mkdir()
    src = tmp_path / "big.txt"
    src.write_text("x" * 1000)

    doc_id = ingest_file(conn, src, library_dir, max_file_mb=0.0001)  # ~100 bytes cap
    assert doc_id is None
    assert dbmod.count_documents(conn) == 0
    conn.close()


def test_xss_snippet_is_escaped(app_and_cfg):
    app, cfg = app_and_cfg
    conn = dbmod.connect(cfg.db_path)
    src = cfg.watch_dir / "xss.txt"
    src.write_text("<script>alert(1)</script> malicious payload here")
    ingest_file(conn, src, cfg.library_dir)
    conn.close()

    client = app.test_client()
    resp = client.get("/library?q=malicious")
    assert resp.status_code == 200
    body = resp.data.decode()
    assert b"<script>alert(1)</script>" not in resp.data
    assert "&lt;script&gt;" in body or "<script>" not in body
