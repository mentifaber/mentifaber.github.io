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

# Keep the reachability probe itself snappy so a container that isn't
# running (or isn't listening yet) doesn't stall the whole ask(). The
# generation timeout, by contrast, needs to be generous: a 3B model's first
# real inference on phone CPU (no GPU, plus proot overhead) can easily take
# well over a minute, especially cold. 30s was cutting that off before the
# model had a chance to actually answer, silently falling back to
# retrieval every time. Override via DOCCRAWLER_OLLAMA_TIMEOUT if needed.
OLLAMA_CONNECT_TIMEOUT = 3
OLLAMA_GENERATE_TIMEOUT = int(os.environ.get("DOCCRAWLER_OLLAMA_TIMEOUT", "180"))


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


def _build_system_prompt(excerpts: list[Excerpt]) -> str:
    context_blocks = []
    for i, ex in enumerate(excerpts, 1):
        context_blocks.append(f"[{i}] Source: {ex.filename}\n{ex.snippet}")
    context = "\n\n".join(context_blocks)
    return (
        "You are 'The Librarian', a helpful assistant answering questions using "
        "ONLY the excerpts below from the user's personal document library, plus "
        "the ongoing conversation history. Cite sources inline using their "
        "bracket numbers, e.g. [1]. If the excerpts don't contain a good answer, "
        "say so honestly rather than guessing. Stay consistent with anything you "
        "already told the user earlier in this conversation.\n\n"
        f"Excerpts:\n{context}"
    )


# Rough char budget for prior-turn history injected into a chat prompt, so a
# long conversation doesn't blow up the context window of a small local model.
CHAT_HISTORY_CHAR_BUDGET = 6000
CHAT_HISTORY_MAX_MESSAGES = 20


def _recent_history(conn: sqlite3.Connection, conversation_id: int) -> list[dict]:
    """Prior messages for a conversation, bounded by both a message count and
    a rough character budget, oldest-first, as {"role", "content"} dicts
    suitable for both Ollama's /api/chat and Anthropic's messages API."""
    rows = dbmod.list_messages(conn, conversation_id, limit=CHAT_HISTORY_MAX_MESSAGES)
    history: list[dict] = []
    total_chars = 0
    # Walk newest-first so the budget keeps the most recent turns, then
    # reverse back to oldest-first for the prompt.
    for row in reversed(rows):
        content = row["content"] or ""
        total_chars += len(content)
        if total_chars > CHAT_HISTORY_CHAR_BUDGET and history:
            break
        history.append({"role": row["role"], "content": content})
    history.reverse()
    return history


def _synthesize_with_ollama_chat(
    system_prompt: str, history: list[dict], question: str,
) -> Optional[str]:
    """Multi-turn variant using Ollama's /api/chat endpoint, which natively
    accepts a `messages` array (system + prior turns + the new question).
    Returns None on any failure so the caller can fall through."""
    host = _ollama_host()
    model = _ollama_model()

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": question})

    payload = json.dumps({
        "model": model,
        "messages": messages,
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{host}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=OLLAMA_GENERATE_TIMEOUT) as resp:
            body = resp.read()
    except urllib.error.URLError as exc:
        log.info("Ollama not reachable at %s (%s); trying next provider.", host, exc)
        return None
    except Exception as exc:  # pragma: no cover - defensive
        log.info("Ollama chat call failed (%s); trying next provider.", exc)
        return None

    try:
        data = json.loads(body)
    except (ValueError, TypeError) as exc:
        log.warning("Ollama returned unparseable response: %s", exc)
        return None

    answer = ((data.get("message") or {}).get("content") or "").strip()
    return answer or None


def _synthesize_with_ai_chat(
    system_prompt: str, history: list[dict], question: str, api_key: str,
) -> Optional[str]:
    try:
        import anthropic
    except ImportError:
        return None

    messages = list(history)
    messages.append({"role": "user", "content": question})

    try:
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model="claude-3-5-haiku-latest",
            max_tokens=800,
            system=system_prompt,
            messages=messages,
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


def chat(
    conn: sqlite3.Connection,
    conversation_id: int,
    user_message: str,
    api_key: str = "",
    limit: int = 6,
) -> AskResult:
    """Multi-turn version of ask(): grounds the answer in the same FTS5
    retrieval for the new user_message, but also includes recent prior
    turns from `conversation_id` as conversation history so the provider can
    give context-aware, coherent follow-up answers -- not just independent
    one-shot ones. Persists both the user message and the assistant's reply
    to the messages table. Falls through the same Ollama -> Anthropic ->
    retrieval chain as ask(), tagging which provider answered.
    """
    # A slow provider call (a local model's first inference can take well
    # over a minute) leaves a window where the user can delete this same
    # conversation from another request before we're done. When that
    # happens, add_message's FOREIGN KEY constraint fails -- don't let that
    # crash the whole request with a 500; the answer is still valid even if
    # there's no conversation left to file it under.
    def _add_message(role: str, content: str, provider: Optional[str] = None) -> None:
        try:
            dbmod.add_message(conn, conversation_id, role, content, provider=provider)
        except sqlite3.IntegrityError:
            log.warning(
                "Could not save %s message -- conversation %s no longer exists "
                "(likely deleted while this reply was still in progress).",
                role, conversation_id,
            )

    _add_message("user", user_message)

    excerpts = search(conn, user_message, limit=limit)
    history = _recent_history(conn, conversation_id)
    # history currently includes the user message we just stored; drop the
    # trailing duplicate since it's passed separately to the provider calls.
    if history and history[-1]["role"] == "user" and history[-1]["content"] == user_message:
        history = history[:-1]

    def _store_and_return(result: AskResult) -> AskResult:
        _add_message("assistant", result.answer, provider=result.provider)
        return result

    if not excerpts:
        return _store_and_return(AskResult(
            answer="No matching documents found in your library for that question.",
            excerpts=[],
            used_ai=False,
            provider="retrieval",
        ))

    system_prompt = _build_system_prompt(excerpts)

    # 1. Local Ollama (The Librarian, local mode).
    try:
        if _ollama_reachable():
            ollama_answer = _synthesize_with_ollama_chat(system_prompt, history, user_message)
            if ollama_answer:
                return _store_and_return(AskResult(
                    answer=ollama_answer, excerpts=excerpts, used_ai=True, provider="ollama"))
        else:
            log.debug("Ollama not reachable at %s; trying next provider.", _ollama_host())
    except Exception as exc:  # pragma: no cover - defensive
        log.info("Ollama provider attempt failed: %s", exc)

    # 2. Anthropic (The Librarian, cloud mode).
    if _anthropic_available(api_key):
        ai_answer = _synthesize_with_ai_chat(system_prompt, history, user_message, api_key)
        if ai_answer:
            return _store_and_return(AskResult(
                answer=ai_answer, excerpts=excerpts, used_ai=True, provider="anthropic"))

    # 3. Pure retrieval fallback.
    lines = [f"Found {len(excerpts)} relevant excerpt(s):\n"]
    for i, ex in enumerate(excerpts, 1):
        lines.append(f"[{i}] {ex.filename}: {ex.snippet}")
    return _store_and_return(AskResult(
        answer="\n".join(lines), excerpts=excerpts, used_ai=False, provider="retrieval"))


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
