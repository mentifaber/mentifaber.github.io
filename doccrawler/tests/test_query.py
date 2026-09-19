from doccrawler import db as dbmod
from doccrawler.ingest import ingest_file
from doccrawler.query import ask


def test_ask_pure_retrieval_fallback_no_api_key(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    library_dir = tmp_path / "library"
    library_dir.mkdir()

    src = tmp_path / "doc.txt"
    src.write_text("Our vacation policy allows 15 days of paid time off per year.")
    ingest_file(conn, src, library_dir)

    result = ask(conn, "vacation policy", api_key="")
    assert result.used_ai is False
    assert len(result.excerpts) >= 1
    assert "doc.txt" in result.answer
    conn.close()


def test_ask_no_results(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    result = ask(conn, "anything", api_key="")
    assert result.excerpts == []
    assert "No matching" in result.answer
    conn.close()
