"""Local web GUI for DocCrawler, built with Flask + server-rendered Jinja2.

Security note: this server is designed to bind to 127.0.0.1 (localhost) by
default and has NO authentication. It is meant for single-user, local-only
use (e.g. on your own phone in Termux). Do not expose it on a public network
or 0.0.0.0 without adding your own auth layer.
"""
from __future__ import annotations

import logging
import math
import tempfile
from pathlib import Path

from flask import (
    Flask, abort, g, redirect, render_template, request, send_file, url_for, flash,
)
from markupsafe import Markup, escape

from . import db as dbmod
from .config import Config, load_config
from .ingest import ingest_file, scan_folder
from .query import ask, chat as chat_query

log = logging.getLogger("doccrawler.web")


def create_app(cfg: Config = None) -> Flask:
    cfg = cfg or load_config()
    cfg.ensure_dirs()

    app = Flask(__name__)
    app.secret_key = "doccrawler-local-secret"  # local single-user tool, no real session risk
    app.config["DOCCRAWLER_CFG"] = cfg
    # Guard against a huge upload hanging the phone/browser: allow a modest
    # multiple of the per-file limit so a batch of a few max-size files
    # still fits, without letting an unbounded request body through.
    app.config["MAX_CONTENT_LENGTH"] = max(cfg.max_file_mb, 1) * 1024 * 1024 * 5

    @app.template_filter("highlight")
    def highlight_filter(text):
        """Render an FTS snippet (which uses literal '[' / ']' markers
        around matched terms) as safe HTML: escape the raw text FIRST
        (it comes straight from user-supplied document content, so it must
        never be trusted as HTML), then turn the marker characters into
        <mark> tags. This replaces a previous `| safe` in the templates
        that skipped escaping entirely and was an XSS risk via a document's
        extracted text.
        """
        if text is None:
            return ""
        escaped = str(escape(text))
        escaped = escaped.replace("[", "<mark>").replace("]", "</mark>")
        return Markup(escaped)

    def get_conn():
        if "conn" not in g:
            g.conn = dbmod.connect(cfg.db_path)
        return g.conn

    @app.teardown_appcontext
    def close_conn(exc=None):
        conn = g.pop("conn", None)
        if conn is not None:
            conn.close()

    @app.route("/")
    def dashboard():
        conn = get_conn()
        s = dbmod.stats(conn)
        recent = dbmod.list_documents(conn, limit=10)
        return render_template("dashboard.html", stats=s, recent=recent)

    @app.route("/upload", methods=["GET", "POST"])
    def upload():
        conn = get_conn()
        if request.method == "POST":
            files = request.files.getlist("files")
            added = 0
            for f in files:
                if not f or not f.filename:
                    continue
                with tempfile.TemporaryDirectory() as tmpdir:
                    tmp_path = Path(tmpdir) / f.filename
                    f.save(tmp_path)
                    doc_id = ingest_file(
                        conn, tmp_path, cfg.library_dir,
                        organize_by=cfg.organize_by, move=False,
                        max_file_mb=cfg.max_file_mb,
                    )
                    if doc_id is not None:
                        added += 1
            skipped = len(files) - added
            msg = f"Imported {added} file(s)."
            if skipped:
                msg += f" ({skipped} skipped: unsupported, too large, or duplicate.)"
            flash(msg)
            return redirect(url_for("upload"))
        return render_template("upload.html")

    @app.route("/scan", methods=["POST"])
    def scan():
        conn = get_conn()
        folder = request.form.get("folder") or str(cfg.watch_dir)
        result = scan_folder(
            conn, Path(folder), cfg.library_dir, organize_by=cfg.organize_by,
            max_file_mb=cfg.max_file_mb,
        )
        flash(f"Scan of {folder}: added={result.added} duplicates={result.duplicates} "
              f"skipped={result.skipped} errors={result.errors}")
        return redirect(url_for("dashboard"))

    @app.route("/library")
    def library():
        conn = get_conn()
        q = request.args.get("q", "").strip()
        try:
            page = max(1, int(request.args.get("page", 1)))
        except ValueError:
            page = 1
        per_page = cfg.library_page_size
        offset = (page - 1) * per_page

        if q:
            rows = dbmod.search_fts(conn, q, limit=per_page, offset=offset)
            total = dbmod.count_search_fts(conn, q)
        else:
            rows = dbmod.list_documents_with_tags(conn, limit=per_page, offset=offset)
            total = dbmod.count_documents(conn)

        total_pages = max(1, math.ceil(total / per_page))
        page = min(page, total_pages)
        return render_template(
            "library.html", docs=rows, q=q, page=page, total_pages=total_pages, total=total,
        )

    @app.route("/doc/<int:doc_id>")
    def doc_detail(doc_id: int):
        conn = get_conn()
        doc = dbmod.get_document(conn, doc_id)
        if doc is None:
            flash("Document not found.")
            return redirect(url_for("library"))
        tags = dbmod.tags_for_document(conn, doc_id)
        return render_template("doc_detail.html", doc=doc, tags=tags)

    def _safe_library_path(doc_row) -> Path:
        """Resolve a document's stored path and make sure it's actually
        inside the configured library directory before we ever open or
        serve it. Defends against a corrupted/tampered DB row (or any
        future code path that lets a path slip through unsanitized) being
        used to read arbitrary files off disk.
        """
        library_root = cfg.library_dir.resolve()
        try:
            candidate = Path(doc_row["path"]).resolve()
        except (OSError, RuntimeError):
            abort(400)
        try:
            candidate.relative_to(library_root)
        except ValueError:
            log.warning("Refusing to serve out-of-library path for doc: %s", doc_row["path"])
            abort(400)
        return candidate

    @app.route("/doc/<int:doc_id>/download")
    def download_doc(doc_id: int):
        conn = get_conn()
        doc = dbmod.get_document(conn, doc_id)
        if doc is None:
            abort(404)
        path = _safe_library_path(doc)
        if not path.is_file():
            abort(404)
        return send_file(path, as_attachment=True, download_name=doc["source_name"])

    @app.route("/doc/<int:doc_id>/delete", methods=["POST"])
    def delete_doc_route(doc_id: int):
        conn = get_conn()
        doc = dbmod.get_document(conn, doc_id)
        if doc is None:
            flash("Document not found.")
            return redirect(url_for("library"))
        delete_file = request.form.get("delete_file") == "on"
        path = doc["path"]
        dbmod.delete_document(conn, doc_id)
        if delete_file:
            try:
                safe_path = _safe_library_path(doc)
                safe_path.unlink(missing_ok=True)
            except Exception as exc:
                log.warning("Could not delete file %s: %s", path, exc)
        flash(f"Deleted '{doc['source_name']}' from the library"
              f"{' (file also removed)' if delete_file else ' (file kept on disk)'}.")
        return redirect(url_for("library"))

    @app.route("/doc/<int:doc_id>/tag", methods=["POST"])
    def add_tag_route(doc_id: int):
        conn = get_conn()
        tag_name = request.form.get("tag", "").strip()
        if tag_name:
            dbmod.tag_document(conn, doc_id, tag_name, auto=False)
            flash(f"Tagged with '{tag_name}'.")
        return redirect(url_for("doc_detail", doc_id=doc_id))

    @app.route("/doc/<int:doc_id>/untag", methods=["POST"])
    def remove_tag_route(doc_id: int):
        conn = get_conn()
        tag_name = request.form.get("tag", "").strip()
        if tag_name:
            dbmod.untag_document(conn, doc_id, tag_name)
        return redirect(url_for("doc_detail", doc_id=doc_id))

    @app.route("/tags")
    def tags_view():
        conn = get_conn()
        tags = dbmod.all_tags(conn)
        selected = request.args.get("tag", "")
        docs = dbmod.documents_for_tag(conn, selected) if selected else []
        return render_template("tags.html", tags=tags, selected=selected, docs=docs)

    @app.route("/tags/delete", methods=["POST"])
    def delete_tag_route():
        conn = get_conn()
        tag_name = request.form.get("tag", "").strip()
        if tag_name:
            dbmod.delete_tag(conn, tag_name)
            flash(f"Deleted tag '{tag_name}'.")
        return redirect(url_for("tags_view"))

    @app.route("/tags/rename", methods=["POST"])
    def rename_tag_route():
        conn = get_conn()
        old_name = request.form.get("old", "").strip()
        new_name = request.form.get("new", "").strip()
        if old_name and new_name:
            dbmod.rename_tag(conn, old_name, new_name)
            flash(f"Renamed tag '{old_name}' to '{new_name}'.")
        return redirect(url_for("tags_view"))

    @app.route("/ask", methods=["GET", "POST"])
    def ask_view():
        """Legacy one-shot ask endpoint, kept for anyone linking directly to
        it. The nav now points at the multi-turn /chat page instead."""
        answer = None
        excerpts = []
        used_ai = False
        provider = None
        question = ""
        if request.method == "POST":
            conn = get_conn()
            question = request.form.get("question", "").strip()
            if question:
                result = ask(conn, question, api_key=cfg.anthropic_api_key)
                answer = result.answer
                excerpts = result.excerpts
                used_ai = result.used_ai
                provider = result.provider
        return render_template(
            "ask.html", answer=answer, excerpts=excerpts, used_ai=used_ai,
            provider=provider, question=question, has_key=bool(cfg.anthropic_api_key),
        )

    def _current_conversation_id(conn):
        conv_id = request.cookies.get("doccrawler_conversation_id")
        if conv_id:
            try:
                conv = dbmod.get_conversation(conn, int(conv_id))
                if conv is not None:
                    return conv["id"]
            except (ValueError, TypeError):
                pass
        existing = dbmod.get_most_recent_conversation(conn)
        if existing is not None:
            return existing["id"]
        return dbmod.create_conversation(conn)

    @app.route("/chat", methods=["GET"])
    def chat_view():
        conn = get_conn()
        conv_id = _current_conversation_id(conn)
        messages = dbmod.list_messages(conn, conv_id)
        conversations = dbmod.list_conversations(conn, limit=20)
        resp = app.make_response(render_template(
            "chat.html", messages=messages, conversation_id=conv_id,
            conversations=conversations, has_key=bool(cfg.anthropic_api_key),
        ))
        resp.set_cookie("doccrawler_conversation_id", str(conv_id), max_age=60 * 60 * 24 * 365)
        return resp

    @app.route("/chat/send", methods=["POST"])
    def chat_send():
        conn = get_conn()
        conv_id = _current_conversation_id(conn)
        message = request.form.get("message", "").strip()
        if message:
            chat_query(conn, conv_id, message, api_key=cfg.anthropic_api_key)
        resp = redirect(url_for("chat_view"))
        resp.set_cookie("doccrawler_conversation_id", str(conv_id), max_age=60 * 60 * 24 * 365)
        return resp

    @app.route("/chat/new", methods=["POST"])
    def chat_new():
        conn = get_conn()
        new_id = dbmod.create_conversation(conn)
        resp = redirect(url_for("chat_view"))
        resp.set_cookie("doccrawler_conversation_id", str(new_id), max_age=60 * 60 * 24 * 365)
        return resp

    @app.route("/chat/switch/<int:conversation_id>", methods=["POST"])
    def chat_switch(conversation_id: int):
        conn = get_conn()
        conv = dbmod.get_conversation(conn, conversation_id)
        resp = redirect(url_for("chat_view"))
        if conv is not None:
            resp.set_cookie("doccrawler_conversation_id", str(conversation_id), max_age=60 * 60 * 24 * 365)
        return resp

    @app.route("/chat/<int:conversation_id>/delete", methods=["POST"])
    def chat_delete(conversation_id: int):
        conn = get_conn()
        dbmod.delete_conversation(conn, conversation_id)
        resp = redirect(url_for("chat_view"))
        resp.set_cookie("doccrawler_conversation_id", "", expires=0)
        return resp

    return app


def run_server(cfg: Config = None):
    cfg = cfg or load_config()
    app = create_app(cfg)
    log.info("Starting DocCrawler web GUI on http://%s:%s (local-only by default)",
              cfg.host, cfg.port)
    app.run(host=cfg.host, port=cfg.port, debug=False)
