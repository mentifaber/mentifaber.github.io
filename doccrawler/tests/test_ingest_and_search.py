from pathlib import Path

from doccrawler import db as dbmod
from doccrawler.ingest import ingest_file, scan_folder


def test_ingest_txt_file_and_fts_search(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    library_dir = tmp_path / "library"
    library_dir.mkdir()

    src = tmp_path / "notes.txt"
    src.write_text("The quick brown fox jumps over the lazy dog. Elephants are large mammals.")

    doc_id = ingest_file(conn, src, library_dir, organize_by="date")
    assert doc_id is not None
    assert dbmod.count_documents(conn) == 1

    doc = dbmod.get_document(conn, doc_id)
    assert "quick brown fox" in doc["text"]
    assert Path(doc["path"]).exists()
    assert Path(doc["path"]).parent != src.parent  # copied into library structure

    results = dbmod.search_fts(conn, "elephants", limit=5)
    assert len(results) == 1
    assert results[0]["id"] == doc_id

    no_results = dbmod.search_fts(conn, "nonexistentword12345", limit=5)
    assert no_results == []
    conn.close()


def test_ingest_dedupe_by_hash(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    library_dir = tmp_path / "library"
    library_dir.mkdir()

    src1 = tmp_path / "a.txt"
    src1.write_text("duplicate content here")
    src2 = tmp_path / "b.txt"
    src2.write_text("duplicate content here")

    id1 = ingest_file(conn, src1, library_dir)
    id2 = ingest_file(conn, src2, library_dir)

    assert id1 is not None
    assert id2 is None  # duplicate, same hash
    assert dbmod.count_documents(conn) == 1
    conn.close()


def test_scan_folder(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    library_dir = tmp_path / "library"
    library_dir.mkdir()
    watch_dir = tmp_path / "watch"
    watch_dir.mkdir()

    (watch_dir / "one.txt").write_text("first document about apples")
    (watch_dir / "two.md").write_text("second document about bananas")
    (watch_dir / "ignore.xyz").write_text("unsupported type")

    result = scan_folder(conn, watch_dir, library_dir)
    assert result.added == 2
    assert result.skipped == 1
    assert dbmod.count_documents(conn) == 2
    conn.close()
