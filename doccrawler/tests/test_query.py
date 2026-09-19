import io
import json
import socket
import urllib.error

import pytest

from doccrawler import db as dbmod
from doccrawler import query as query_mod
from doccrawler.ingest import ingest_file
from doccrawler.query import ask


def _make_library(tmp_path):
    conn = dbmod.connect(tmp_path / "test.db")
    library_dir = tmp_path / "library"
    library_dir.mkdir()

    src = tmp_path / "doc.txt"
    src.write_text("Our vacation policy allows 15 days of paid time off per year.")
    ingest_file(conn, src, library_dir)
    return conn


def test_ask_pure_retrieval_fallback_no_api_key(tmp_path, monkeypatch):
    # Ensure Ollama is treated as unreachable so this exercises the plain
    # retrieval fallback deterministically, with no real network calls.
    monkeypatch.setattr(query_mod, "_ollama_reachable", lambda: False)

    conn = _make_library(tmp_path)
    result = ask(conn, "vacation policy", api_key="")
    assert result.used_ai is False
    assert result.provider == "retrieval"
    assert len(result.excerpts) >= 1
    assert "doc.txt" in result.answer
    conn.close()


def test_ask_no_results(tmp_path, monkeypatch):
    monkeypatch.setattr(query_mod, "_ollama_reachable", lambda: False)
    conn = dbmod.connect(tmp_path / "test.db")
    result = ask(conn, "anything", api_key="")
    assert result.excerpts == []
    assert "No matching" in result.answer
    conn.close()


def test_ask_ollama_success_path(tmp_path, monkeypatch):
    """When Ollama is reachable and returns an answer, ask() should use it
    and report provider='ollama', without making any real network calls."""
    monkeypatch.setattr(query_mod, "_ollama_reachable", lambda: True)

    class _FakeResponse(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def fake_urlopen(req, timeout=None):
        assert "api/generate" in req.full_url
        body = json.dumps({"response": "The vacation policy is 15 days [1]."}).encode()
        return _FakeResponse(body)

    monkeypatch.setattr(query_mod.urllib.request, "urlopen", fake_urlopen)

    conn = _make_library(tmp_path)
    result = ask(conn, "vacation policy", api_key="")
    assert result.provider == "ollama"
    assert result.used_ai is True
    assert "15 days" in result.answer
    conn.close()


def test_ask_ollama_unreachable_falls_through_to_retrieval(tmp_path, monkeypatch):
    """If Ollama is unreachable and no Anthropic key is configured, ask()
    should still fall through cleanly to plain retrieval (existing
    no-key/no-sdk fallback behavior), never raising or hanging."""
    monkeypatch.setattr(query_mod, "_ollama_reachable", lambda: False)

    conn = _make_library(tmp_path)
    result = ask(conn, "vacation policy", api_key="")
    assert result.provider == "retrieval"
    assert result.used_ai is False
    conn.close()


def test_ask_ollama_slow_or_erroring_does_not_hang(tmp_path, monkeypatch):
    """A slow/erroring Ollama must not hang the test suite: the reachability
    probe uses a short timeout and any error there (or during generation) is
    caught, falling through to the next provider."""

    def fake_urlopen_probe(req, timeout=None):
        # Simulate what a real short-timeout connection failure looks like,
        # without any real socket wait.
        raise urllib.error.URLError(socket.timeout("timed out"))

    monkeypatch.setattr(query_mod.urllib.request, "urlopen", fake_urlopen_probe)

    conn = _make_library(tmp_path)
    result = ask(conn, "vacation policy", api_key="")
    assert result.provider == "retrieval"
    assert result.used_ai is False
    conn.close()
