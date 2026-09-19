"""Retrieval and optional RAG-style question answering ("The Librarian").

Provider chain, in order:
  1. Local Ollama (running inside a proot-distro Linux container on Termux, or
     natively on desktop Linux/macOS) -- reachable at DOCCRAWLER_OLLAMA_HOST
     (default http://127.0.0.1:11434), model DOCCRAWLER_OLLAMA_MODEL (default
     llama3.2:3b). Uses only the stdlib (urllib) so there's no new dependency,
     and uses short timeouts so an absent/unreachable Ollama never hangs.
  2. Anthropic, if ANTHROPIC_API_KEY is set and the `anthropic` package is
     installed (unchanged from before).
  3. Pure retrieval: rank FTS5 hits and return excerpts with citations.

Each provider attempt catches its own errors and never raises past ask() --
it degrades gracefully all the way down to plain retrieval.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

from . import db as dbmod

log = logging.getLogger("doccrawler.query")

_ANTHROPIC_WARNED = False

DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434"
DEFAULT_OLLAMA_MODEL = "llama3.2:3b"

# Keep the reachability/generation call itself snappy so a container that
# isn't running (or isn't listening yet) doesn't stall the whole ask().
OLLAMA_CONNECT_TIMEOUT = 3
OLLAMA_GENERATE_TIMEOUT = 30


@dataclass
class Excerpt:
    doc_id: int
    filename: str
    path: str
    snippet: str


@dataclass
class AskResult:
    answer: str
    excerpts: list = field(default_factory=list)
    used_ai: bool = False
    # Which provider produced the answer: "ollama", "anthropic", or "retrieval".
    provider: str = "retrieval"


def search(conn: sqlite3.Connection, query: str, limit: int = 8) -> list[Excerpt]:
    rows = dbmod.search_fts(conn, query, limit=limit)
    return [
        Excerpt(
            doc_id=r["id"],
            filename=r["source_name"],
            path=r["path"],
            snippet=(r["snippet"] or "").strip(),
        )
        for r in rows
    ]


def _ollama_host() -> str:
    return os.environ.get("DOCCRAWLER_OLLAMA_HOST", DEFAULT_OLLAMA_HOST).rstrip("/")


def _ollama_model() -> str:
    return os.environ.get("DOCCRAWLER_OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL)


def _build_prompt(question: str, excerpts: list[Excerpt]) -> str:
    context_blocks = []
    for i, ex in enumerate(excerpts, 1):
        context_blocks.append(f"[{i}] Source: {ex.filename}\n{ex.snippet}")
    context = "\n\n".join(context_blocks)

    return (
        "You are answering a question using ONLY the excerpts below from the "
        "user's personal document library. Cite sources inline using their "
        "bracket numbers, e.g. [1]. If the excerpts don't contain a good "
        "answer, say so honestly rather than guessing.\n\n"
        f"Excerpts:\n{context}\n\nQuestion: {question}\n\nAnswer:"
    )


def _synthesize_with_ollama(question: str, excerpts: list[Excerpt]) -> Optional[str]:
    """Try the local Ollama server. Returns None (and logs) on any failure so
    the caller can fall through to the next provider. Never raises."""
    host = _ollama_host()
    model = _ollama_model()
    prompt = _build_prompt(question, excerpts)

    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{host}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=OLLAMA_GENERATE_TIMEOUT) as resp:
            body = resp.read()
    except urllib.error.URLError as exc:
        # Includes connection refused / timeout -- the common "not running" case.
        log.info("Ollama not reachable at %s (%s); trying next provider.", host, exc)
        return None
    except Exception as exc:  # pragma: no cover - defensive
        log.info("Ollama call failed (%s); trying next provider.", exc)
        return None

    try:
        data = json.loads(body)
    except (ValueError, TypeError) as exc:
        log.warning("Ollama returned unparseable response: %s", exc)
        return None

    answer = (data.get("response") or "").strip()
    return answer or None


def _ollama_reachable() -> bool:
    """Cheap reachability probe with a short connect timeout, so that when
    Ollama isn't running we fail fast instead of waiting out the full
    generation timeout."""
    host = _ollama_host()
    req = urllib.request.Request(f"{host}/api/tags", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=OLLAMA_CONNECT_TIMEOUT):
            return True
    except Exception as exc:
        log.debug("Ollama reachability probe failed at %s: %s", host, exc)
        return False


def _anthropic_available(api_key: str) -> bool:
    global _ANTHROPIC_WARNED
    if not api_key:
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        if not _ANTHROPIC_WARNED:
            log.warning("ANTHROPIC_API_KEY is set but the 'anthropic' package is not "
                        "installed; falling back to pure retrieval mode. Install with: "
                        "pip install anthropic")
            _ANTHROPIC_WARNED = True
        return False
    return True


def _synthesize_with_ai(question: str, excerpts: list[Excerpt], api_key: str) -> Optional[str]:
    try:
        import anthropic
    except ImportError:
        return None

    prompt = _build_prompt(question, excerpts)

    try:
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model="claude-3-5-haiku-latest",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        parts = []
        for block in resp.content:
            text = getattr(block, "text", None)
            if text:
                parts.append(text)
        return "\n".join(parts).strip() or None
    except Exception as exc:
        log.warning("Anthropic API call failed, falling back to retrieval mode: %s", exc)
        return None


def ask(conn: sqlite3.Connection, question: str, api_key: str = "", limit: int = 6) -> AskResult:
    excerpts = search(conn, question, limit=limit)

    if not excerpts:
        return AskResult(
            answer="No matching documents found in your library for that question.",
            excerpts=[],
            used_ai=False,
            provider="retrieval",
        )

    # 1. Local Ollama (The Librarian, local mode).
    try:
        if _ollama_reachable():
            ollama_answer = _synthesize_with_ollama(question, excerpts)
            if ollama_answer:
                return AskResult(answer=ollama_answer, excerpts=excerpts, used_ai=True,
                                  provider="ollama")
        else:
            log.debug("Ollama not reachable at %s; trying next provider.", _ollama_host())
    except Exception as exc:  # pragma: no cover - defensive, never let ask() crash
        log.info("Ollama provider attempt failed: %s", exc)

    # 2. Anthropic (The Librarian, cloud mode).
    if _anthropic_available(api_key):
        ai_answer = _synthesize_with_ai(question, excerpts, api_key)
        if ai_answer:
            return AskResult(answer=ai_answer, excerpts=excerpts, used_ai=True,
                              provider="anthropic")

    # 3. Pure retrieval fallback: format the excerpts as the "answer".
    lines = [f"Found {len(excerpts)} relevant excerpt(s):\n"]
    for i, ex in enumerate(excerpts, 1):
        lines.append(f"[{i}] {ex.filename}: {ex.snippet}")
    return AskResult(answer="\n".join(lines), excerpts=excerpts, used_ai=False,
                      provider="retrieval")
