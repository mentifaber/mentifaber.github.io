# DocCrawler

A self-contained document ingestion, full-text search, tagging, and
retrieval ("ask my library") tool. Built to run comfortably on **Termux on
Android**, and equally on a normal Linux/macOS Python install.

It watches/scans a folder for documents (images, PDFs, docx, txt,
markdown), extracts their text, stores everything in a local SQLite
database with FTS5 full-text search, auto-tags documents by keyword
frequency, and gives you both a CLI and a local web GUI to browse, search,
tag, and ask questions against your library.

## Features

- **Ingestion**: scan a folder (recursively) or import files one-off through
  the web UI. Files are content-hashed (SHA-256) and deduplicated, then
  copied into an organized `library/YYYY/MM/<hash>.ext` structure.
- **Extraction**: `.txt`/`.md` read directly, `.pdf` via `pypdf`, `.docx` via
  `python-docx`, images via OCR (`pytesseract` + the `tesseract` binary) if
  available — if OCR isn't installed, image ingestion still records the file
  but logs a warning and stores no text, rather than crashing.
- **Database**: plain SQLite (stdlib `sqlite3`, no server process) with an
  FTS5 virtual table for fast full-text search, plus a tags / document_tags
  many-to-many schema. Auto-tagging picks the top keywords per document
  using a lightweight term-frequency heuristic; you can also add/remove tags
  manually.
- **Ask**: a retrieval-based question answering function. It always does an
  FTS5 search and returns ranked excerpts with filename citations. If
  `ANTHROPIC_API_KEY` is set **and** the `anthropic` package is installed,
  it additionally asks Claude to synthesize a natural-language answer from
  those excerpts (RAG-style). Without a key it just returns the ranked
  excerpts — it never crashes for lack of a key or the SDK.
- **Web GUI**: a small Flask app (dashboard, import, library/search, tags,
  ask) rendered with server-side Jinja2 templates and minimal CSS/JS — no
  build step, nothing heavy, friendly to a phone screen.
- **CLI**: `doccrawler scan|serve|ask|tag|stats`.

## Security / deployment note (read this)

The web server binds to `127.0.0.1` (localhost) by default and has **no
authentication**. It is a local, single-user tool by design — meant to be
opened from a browser on the same device (e.g. Termux + a browser app on
your phone). There is no "cloud sync", no multi-user accounts, and no
enterprise auth story here. If you want to reach it from another device on
your LAN, you can pass `--host 0.0.0.0`, but understand that anyone on that
network could then read and modify your library — do this only on networks
you trust, and consider adding your own reverse proxy + auth in front of it
if you need that.

## Termux setup (Android)

```sh
pkg update && pkg upgrade
pkg install python git
# Optional, for OCR of images:
pkg install tesseract
# Optional build tools some wheels may need:
pkg install build-essential

git clone <this repo url>
cd mentifaber.github.io/doccrawler
pip install -e .
# Optional extras:
pip install -e ".[ocr]"   # pytesseract (still needs the tesseract binary above)
pip install -e ".[ai]"    # anthropic SDK, for AI-synthesized answers
```

Termux note: `pypdf`, `python-docx`, `Pillow`, and `Flask` are all pure
Python or ship prebuilt wheels and install fine under Termux's `pip`.
Nothing in this project requires TensorFlow, PyTorch, or other heavy native
ML dependencies that are hard to build on Android.

## Quick start (any platform)

```sh
cd doccrawler
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -e .

# Ingest a folder of documents:
doccrawler scan ~/Downloads/inbox

# Start the local web GUI (opens on http://127.0.0.1:8765):
doccrawler serve

# Ask a question from the terminal:
doccrawler ask "what does the contract say about termination?"

# See stats:
doccrawler stats

# Manage tags:
doccrawler tag --list
doccrawler tag --doc-id 3 --name important
doccrawler tag --doc-id 3 --name important --remove
```

Then open `http://127.0.0.1:8765/` in a browser for the dashboard, import
page, library search, tag browser, and ask box.

## Architecture

```
doccrawler/
  doccrawler/
    __init__.py
    config.py        # config file + env var handling
    logging_setup.py # central logging config
    db.py            # sqlite schema, FTS5, tags, stats
    extract.py        # per-file-type text extraction (pdf/docx/txt/ocr)
    ingest.py          # hashing, dedupe, library organization, ingest pipeline
    tagging.py          # keyword-frequency auto-tagging
    query.py            # FTS5 retrieval + optional Anthropic RAG synthesis
    web.py               # Flask app: dashboard/upload/library/tags/ask
    cli.py               # argparse CLI: scan/serve/ask/tag/stats
    templates/           # server-rendered Jinja2 HTML
  tests/                  # pytest suite
  pyproject.toml
  requirements.txt
```

Data flow: `scan`/upload → `ingest.ingest_file()` hashes + dedupes + copies
into `library/` → `extract.extract_text()` pulls text per file type →
`db.insert_document()` stores metadata + text and the FTS5 trigger indexes
it → `tagging.auto_tags()` assigns keyword tags → available immediately via
FTS5 search (`db.search_fts`) or the retrieval/RAG `query.ask()` function,
in the CLI and the web GUI.

## Configuration

All settings can be set via a JSON config file, environment variables, or
just left at their defaults. Precedence: defaults < config file < env vars.

Config file location: `~/.doccrawler/config.json` by default, override the
*location* with `DOCCRAWLER_CONFIG`. Example:

```json
{
  "home": "/data/data/com.termux/files/home/.doccrawler",
  "db_path": "/data/data/com.termux/files/home/.doccrawler/doccrawler.db",
  "library_dir": "/data/data/com.termux/files/home/.doccrawler/library",
  "watch_dir": "/data/data/com.termux/files/home/storage/downloads",
  "host": "127.0.0.1",
  "port": 8765,
  "organize_by": "date"
}
```

Environment variables (override the config file):

| Variable | Purpose |
|---|---|
| `DOCCRAWLER_HOME` | Base directory for db/library/watch defaults (default `~/.doccrawler`) |
| `DOCCRAWLER_DB` | Path to the SQLite database file |
| `DOCCRAWLER_LIBRARY` | Path to the organized library folder |
| `DOCCRAWLER_WATCH` | Default folder for `doccrawler scan` / the "Scan" button with no path |
| `DOCCRAWLER_HOST` | Web GUI bind host (default `127.0.0.1`) |
| `DOCCRAWLER_PORT` | Web GUI bind port (default `8765`) |
| `DOCCRAWLER_CONFIG` | Path to the JSON config file itself |
| `ANTHROPIC_API_KEY` | If set (and `anthropic` is installed), enables AI-synthesized answers in `ask` |

`organize_by` can be `"date"` (library files organized under `YYYY/MM/`) or
`"hash"` (organized under the first bytes of the content hash).

## Running the tests

```sh
cd doccrawler   # or repo root, either works
pip install -e ".[ocr,ai]" pytest   # extras optional, only pytest is required
pytest doccrawler/tests -q
```

The test suite covers: database schema creation, document insert/lookup,
manual tagging, ingest-and-dedupe, folder scanning, FTS5 search, keyword
auto-tagging, and the retrieval/ask fallback path (no API key required).

## Known limitations

- OCR quality depends entirely on the installed `tesseract` binary/language
  data; DocCrawler does not bundle or train any OCR model itself.
- Auto-tagging is a simple frequency-based heuristic, not a trained
  classifier — treat it as a helpful starting point, not ground truth.
- The AI-synthesized answer mode is optional and only as good as the
  underlying model's ability to summarize the retrieved excerpts; always
  check the cited source documents for anything important.
