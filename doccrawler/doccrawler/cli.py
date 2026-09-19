"""CLI entrypoint for DocCrawler."""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from . import db as dbmod
from .config import load_config
from .ingest import scan_folder
from .logging_setup import setup_logging
from .query import ask as ask_query, chat as chat_query

log = logging.getLogger("doccrawler.cli")


def cmd_scan(args, cfg) -> int:
    conn = dbmod.connect(cfg.db_path)
    result = scan_folder(
        conn, Path(args.path), cfg.library_dir,
        organize_by=cfg.organize_by, move=args.move, recursive=not args.no_recursive,
    )
    print(f"Added: {result.added}  Duplicates: {result.duplicates}  "
          f"Skipped: {result.skipped}  Errors: {result.errors}")
    conn.close()
    return 0


def cmd_serve(args, cfg) -> int:
    from .web import run_server
    if args.host:
        cfg.host = args.host
    if args.port:
        cfg.port = args.port
    run_server(cfg)
    return 0


def cmd_ask(args, cfg) -> int:
    conn = dbmod.connect(cfg.db_path)
    result = ask_query(conn, args.question, api_key=cfg.anthropic_api_key)
    print(result.answer)
    print(f"\nAnswered by: {_PROVIDER_LABELS.get(result.provider, result.provider)}")
    if result.excerpts:
        print("\nSources:")
        for ex in result.excerpts:
            print(f"  - {ex.filename} (doc id {ex.doc_id})")
    conn.close()
    return 0


_PROVIDER_LABELS = {
    "ollama": "The Librarian (local, via Ollama)",
    "anthropic": "The Librarian (cloud, via Anthropic)",
    "retrieval": "Retrieval only (no AI provider available)",
}


def cmd_chat(args, cfg) -> int:
    """Interactive multi-turn REPL against the same conversation storage used
    by the web GUI, so a conversation can move between CLI and browser.

    By default, continues the most recently active conversation (creating
    one if none exists yet). Pass --new to start a fresh conversation.
    """
    conn = dbmod.connect(cfg.db_path)
    if args.new:
        conv_id = dbmod.create_conversation(conn)
        print(f"Started new conversation (id {conv_id}).")
    else:
        existing = dbmod.get_most_recent_conversation(conn)
        if existing is not None:
            conv_id = existing["id"]
            print(f"Continuing conversation (id {conv_id}, "
                  f"{existing['message_count']} prior message(s)). Use --new to start fresh.")
        else:
            conv_id = dbmod.create_conversation(conn)
            print(f"Started new conversation (id {conv_id}).")

    print("Type your question, or 'exit'/'quit' to leave (Ctrl+D / Ctrl+C also work).\n")
    while True:
        try:
            line = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        if line.lower() in ("exit", "quit"):
            break
        result = chat_query(conn, conv_id, line, api_key=cfg.anthropic_api_key)
        label = _PROVIDER_LABELS.get(result.provider, result.provider)
        print(f"librarian [{label}]> {result.answer}\n")

    conn.close()
    return 0


def cmd_tag(args, cfg) -> int:
    conn = dbmod.connect(cfg.db_path)
    if args.list:
        for t in dbmod.all_tags(conn):
            print(f"{t['name']}\t{t['n']}")
    elif args.delete_name:
        ok = dbmod.delete_tag(conn, args.delete_name)
        print(f"Deleted tag '{args.delete_name}'." if ok else f"No such tag: '{args.delete_name}'")
    elif args.rename:
        old, new = args.rename
        ok = dbmod.rename_tag(conn, old, new)
        print(f"Renamed '{old}' -> '{new}'." if ok else f"No such tag: '{old}'")
    elif args.doc_id is not None and args.name:
        if args.remove:
            dbmod.untag_document(conn, args.doc_id, args.name)
            print(f"Removed tag '{args.name}' from document {args.doc_id}")
        else:
            dbmod.tag_document(conn, args.doc_id, args.name, auto=False)
            print(f"Tagged document {args.doc_id} with '{args.name}'")
    else:
        print("Use --list, --delete-name, --rename OLD NEW, or --doc-id and --name to tag a document.")
        return 1
    conn.close()
    return 0


def cmd_forget(args, cfg) -> int:
    """Remove a document from the library (DB row + FTS + tags). By default
    the on-disk file in library/ is left alone -- deleting it is opt-in via
    --delete-file, since a mistaken forget shouldn't also destroy the only
    copy of the original file.
    """
    conn = dbmod.connect(cfg.db_path)
    doc = dbmod.get_document(conn, args.doc_id)
    if doc is None:
        print(f"No such document id: {args.doc_id}")
        conn.close()
        return 1
    path = dbmod.delete_document(conn, args.doc_id)
    print(f"Forgot document {args.doc_id} ({doc['source_name']}).")
    if args.delete_file and path:
        try:
            library_root = cfg.library_dir.resolve()
            file_path = Path(path).resolve()
            file_path.relative_to(library_root)  # path-traversal guard
            file_path.unlink(missing_ok=True)
            print(f"Deleted file: {file_path}")
        except ValueError:
            print(f"Refused to delete file outside the library dir: {path}")
        except OSError as exc:
            print(f"Could not delete file {path}: {exc}")
    conn.close()
    return 0


def cmd_stats(args, cfg) -> int:
    conn = dbmod.connect(cfg.db_path)
    s = dbmod.stats(conn)
    print(f"Documents: {s['doc_count']}")
    print(f"Tags: {s['tag_count']}")
    print(f"Total size: {s['total_size'] / 1024 / 1024:.2f} MB")
    print("By type:")
    for t in s["by_type"]:
        print(f"  {t['mime_type']}: {t['c']}")
    conn.close()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="doccrawler", description="DocCrawler: local document crawler and search tool.")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    sub = parser.add_subparsers(dest="command", required=True)

    p_scan = sub.add_parser("scan", help="Ingest all supported files from a folder")
    p_scan.add_argument("path", help="Folder to scan")
    p_scan.add_argument("--move", action="store_true", help="Move files instead of copying")
    p_scan.add_argument("--no-recursive", action="store_true", help="Do not recurse into subfolders")
    p_scan.set_defaults(func=cmd_scan)

    p_serve = sub.add_parser("serve", help="Start the local web GUI")
    p_serve.add_argument("--host", default=None, help="Host to bind (default: 127.0.0.1)")
    p_serve.add_argument("--port", type=int, default=None, help="Port to bind (default: 8765)")
    p_serve.set_defaults(func=cmd_serve)

    p_ask = sub.add_parser(
        "ask",
        help="The Librarian: ask a question against your document library "
             "(tries local Ollama, then Anthropic, then falls back to plain retrieval)",
    )
    p_ask.add_argument("question", help="Natural language question")
    p_ask.set_defaults(func=cmd_ask)

    p_chat = sub.add_parser(
        "chat",
        help="The Librarian: interactive multi-turn chat REPL against your document "
             "library (same provider chain as 'ask', but remembers conversation history)",
    )
    p_chat.add_argument("--new", action="store_true", help="Start a new conversation instead of continuing the most recent one")
    p_chat.set_defaults(func=cmd_chat)

    p_tag = sub.add_parser("tag", help="Manage tags")
    p_tag.add_argument("--list", action="store_true", help="List all tags")
    p_tag.add_argument("--doc-id", type=int, help="Document id to tag")
    p_tag.add_argument("--name", help="Tag name")
    p_tag.add_argument("--remove", action="store_true", help="Remove the tag instead of adding it")
    p_tag.add_argument("--delete-name", help="Delete a tag entirely, from every document")
    p_tag.add_argument("--rename", nargs=2, metavar=("OLD", "NEW"), help="Rename (or merge) a tag")
    p_tag.set_defaults(func=cmd_tag)

    p_forget = sub.add_parser("forget", help="Remove a document from the library")
    p_forget.add_argument("doc_id", type=int, help="Document id to forget")
    p_forget.add_argument("--delete-file", action="store_true",
                           help="Also delete the file from library/ on disk (default: keep it)")
    p_forget.set_defaults(func=cmd_forget)

    p_stats = sub.add_parser("stats", help="Show library statistics")
    p_stats.set_defaults(func=cmd_stats)

    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    setup_logging(logging.DEBUG if args.verbose else logging.INFO)
    cfg = load_config()

    try:
        return args.func(args, cfg)
    except KeyboardInterrupt:
        print("\nInterrupted.")
        return 130
    except Exception as exc:
        log.error("doccrawler failed: %s", exc, exc_info=args.verbose)
        return 1


if __name__ == "__main__":
    sys.exit(main())
