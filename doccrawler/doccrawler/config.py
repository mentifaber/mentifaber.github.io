"""Configuration handling for DocCrawler.

Configuration can come from (in order of increasing priority):
  1. Built-in defaults
  2. A JSON config file (default: ~/.doccrawler/config.json, override with
     DOCCRAWLER_CONFIG env var)
  3. Environment variables (DOCCRAWLER_HOME, DOCCRAWLER_DB, DOCCRAWLER_LIBRARY,
     DOCCRAWLER_WATCH, DOCCRAWLER_HOST, DOCCRAWLER_PORT, ANTHROPIC_API_KEY)
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger("doccrawler.config")

DEFAULT_HOME = Path(os.environ.get("DOCCRAWLER_HOME", str(Path.home() / ".doccrawler")))


@dataclass
class Config:
    home: Path = field(default_factory=lambda: DEFAULT_HOME)
    db_path: Path = field(default=None)  # type: ignore
    library_dir: Path = field(default=None)  # type: ignore
    watch_dir: Path = field(default=None)  # type: ignore
    host: str = "127.0.0.1"
    port: int = 8765
    anthropic_api_key: str = ""
    organize_by: str = "date"  # "date" or "hash"

    def __post_init__(self):
        if self.db_path is None:
            self.db_path = self.home / "doccrawler.db"
        if self.library_dir is None:
            self.library_dir = self.home / "library"
        if self.watch_dir is None:
            self.watch_dir = self.home / "watch"

    def ensure_dirs(self):
        for d in (self.home, self.library_dir, self.watch_dir):
            Path(d).mkdir(parents=True, exist_ok=True)


def _config_file_path() -> Path:
    return Path(os.environ.get("DOCCRAWLER_CONFIG", str(DEFAULT_HOME / "config.json")))


def load_config() -> Config:
    cfg = Config()

    cfg_file = _config_file_path()
    if cfg_file.exists():
        try:
            data = json.loads(cfg_file.read_text())
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Could not parse config file %s: %s", cfg_file, exc)
            data = {}
        if "home" in data:
            cfg.home = Path(data["home"])
        if "db_path" in data:
            cfg.db_path = Path(data["db_path"])
        if "library_dir" in data:
            cfg.library_dir = Path(data["library_dir"])
        if "watch_dir" in data:
            cfg.watch_dir = Path(data["watch_dir"])
        if "host" in data:
            cfg.host = data["host"]
        if "port" in data:
            cfg.port = int(data["port"])
        if "organize_by" in data:
            cfg.organize_by = data["organize_by"]
        cfg.__post_init__()

    if os.environ.get("DOCCRAWLER_HOME"):
        cfg.home = Path(os.environ["DOCCRAWLER_HOME"])
        cfg.__post_init__()
    if os.environ.get("DOCCRAWLER_DB"):
        cfg.db_path = Path(os.environ["DOCCRAWLER_DB"])
    if os.environ.get("DOCCRAWLER_LIBRARY"):
        cfg.library_dir = Path(os.environ["DOCCRAWLER_LIBRARY"])
    if os.environ.get("DOCCRAWLER_WATCH"):
        cfg.watch_dir = Path(os.environ["DOCCRAWLER_WATCH"])
    if os.environ.get("DOCCRAWLER_HOST"):
        cfg.host = os.environ["DOCCRAWLER_HOST"]
    if os.environ.get("DOCCRAWLER_PORT"):
        cfg.port = int(os.environ["DOCCRAWLER_PORT"])

    cfg.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")

    cfg.ensure_dirs()
    return cfg
