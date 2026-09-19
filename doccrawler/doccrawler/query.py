"""Retrieval and optional RAG-style question answering.

Pure retrieval mode: rank FTS5 hits and return excerpts with citations.
AI mode: if ANTHROPIC_API_KEY is set and the `anthropic` package is
installed, feed the retrieved excerpts to Claude to synthesize a natural
language answer. Falls back cleanly to pure retrieval otherwise -- never
crashes for lack of a key or the SDK.
"""
from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass, field
from typing import Optional

from . import db as dbmod

log = logging.getLogger("doccrawler.query")

_ANTHROPIC_WARNED = False


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

    context_blocks = []
    for i, ex in enumerate(excerpts, 1):
        context_blocks.append(f"[{i}] Source: {ex.filename}\n{ex.snippet}")
    context = "\n\n".join(context_blocks)

    prompt = (
        "You are answering a question using ONLY the excerpts below from the "
        "user's personal document library. Cite sources inline using their "
        "bracket numbers, e.g. [1]. If the excerpts don't contain a good "
        "answer, say so honestly rather than guessing.\n\n"
        f"Excerpts:\n{context}\n\nQuestion: {question}\n\nAnswer:"
    )

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
        )

    if _anthropic_available(api_key):
        ai_answer = _synthesize_with_ai(question, excerpts, api_key)
        if ai_answer:
            return AskResult(answer=ai_answer, excerpts=excerpts, used_ai=True)

    # Pure retrieval fallback: format the excerpts as the "answer".
    lines = [f"Found {len(excerpts)} relevant excerpt(s):\n"]
    for i, ex in enumerate(excerpts, 1):
        lines.append(f"[{i}] {ex.filename}: {ex.snippet}")
    return AskResult(answer="\n".join(lines), excerpts=excerpts, used_ai=False)
