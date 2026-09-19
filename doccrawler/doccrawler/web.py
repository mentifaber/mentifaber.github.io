"""Local web GUI for DocCrawler, built with Flask + server-rendered Jinja2.

Security note: this server is designed to bind to 127.0.0.1 (localhost) by
default and has NO authentication. It is meant for single-user, local-only
use (e.g. on your own phone in Termux). Do not expose it on a public network
or 0.0.0.0 without adding your own auth layer.
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from flask import Flask, g, redirect, render_template, request, url_for, flash

from . import db as dbmod
from .config import Config, load_config
from .ingest import ingest_file, scan_folder
from .query import ask

log = logging.getLogger("doccrawler.web")


def create_app(cfg: Config = None) -> Flask:
    cfg = cfg or load_config()
    cfg.ensure_dirs()

    app = Flask(__name__)
    app.secret_key = "doccrawler-local-secret"  # local single-user tool, no real session risk
    app.config["DOCCRAWLER_CFG"] = cfg

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
                    )
                    if doc_id is not None:
                        added += 1
            flash(f"Imported {added} file(s).")
            return redirect(url_for("upload"))
        return render_template("upload.html")

    @app.route("/scan", methods=["POST"])
    def scan():
        conn = get_conn()
        folder = request.form.get("folder") or str(cfg.watch_dir)
        result = scan_folder(conn, Path(folder), cfg.library_dir, organize_by=cfg.organize_by)
        flash(f"Scan of {folder}: added={result.added} duplicates={result.duplicates} "
              f"skipped={result.skipped} errors={result.errors}")
        return redirect(url_for("dashboard"))

    @app.route("/library")
    def library():
        conn = get_conn()
        q = request.args.get("q", "").strip()
        if q:
            rows = dbmod.search_fts(conn, q, limit=50)
        else:
            rows = dbmod.list_documents(conn, limit=100)
        return render_template("library.html", docs=rows, q=q)

    @app.route("/doc/<int:doc_id>")
    def doc_detail(doc_id: int):
        conn = get_conn()
        doc = dbmod.get_document(conn, doc_id)
        if doc is None:
            flash("Document not found.")
            return redirect(url_for("library"))
        tags = dbmod.tags_for_document(conn, doc_id)
        return render_template("doc_detail.html", doc=doc, tags=tags)

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

    @app.route("/ask", methods=["GET", "POST"])
    def ask_view():
        answer = None
        excerpts = []
        used_ai = False
        question = ""
        if request.method == "POST":
            conn = get_conn()
            question = request.form.get("question", "").strip()
            if question:
                result = ask(conn, question, api_key=cfg.anthropic_api_key)
                answer = result.answer
                excerpts = result.excerpts
                used_ai = result.used_ai
        return render_template(
            "ask.html", answer=answer, excerpts=excerpts, used_ai=used_ai,
            question=question, has_key=bool(cfg.anthropic_api_key),
        )

    return app


def run_server(cfg: Config = None):
    cfg = cfg or load_config()
    app = create_app(cfg)
    log.info("Starting DocCrawler web GUI on http://%s:%s (local-only by default)",
              cfg.host, cfg.port)
    app.run(host=cfg.host, port=cfg.port, debug=False)
