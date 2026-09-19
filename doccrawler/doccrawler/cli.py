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
from .query import ask as ask_query

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
    if result.excerpts:
        print("\nSources:")
        for ex in result.excerpts:
            print(f"  - {ex.filename} (doc id {ex.doc_id})")
    conn.close()
    return 0


def cmd_tag(args, cfg) -> int:
    conn = dbmod.connect(cfg.db_path)
    if args.list:
        for t in dbmod.all_tags(conn):
            print(f"{t['name']}\t{t['n']}")
    elif args.doc_id is not None and args.name:
        if args.remove:
            dbmod.untag_document(conn, args.doc_id, args.name)
            print(f"Removed tag '{args.name}' from document {args.doc_id}")
        else:
            dbmod.tag_document(conn, args.doc_id, args.name, auto=False)
            print(f"Tagged document {args.doc_id} with '{args.name}'")
    else:
        print("Use --list, or provide --doc-id and --name to tag a document.")
        return 1
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

    p_ask = sub.add_parser("ask", help="Ask a question against your document library")
    p_ask.add_argument("question", help="Natural language question")
    p_ask.set_defaults(func=cmd_ask)

    p_tag = sub.add_parser("tag", help="Manage tags")
    p_tag.add_argument("--list", action="store_true", help="List all tags")
    p_tag.add_argument("--doc-id", type=int, help="Document id to tag")
    p_tag.add_argument("--name", help="Tag name")
    p_tag.add_argument("--remove", action="store_true", help="Remove the tag instead of adding it")
    p_tag.set_defaults(func=cmd_tag)

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
