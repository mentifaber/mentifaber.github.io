"""Central logging setup for DocCrawler."""
from __future__ import annotations

import logging
import sys


def setup_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger("doccrawler")
    if root.handlers:
        # Already configured (e.g. re-entrant calls, tests).
        root.setLevel(level)
        return
    root.setLevel(level)
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s", "%H:%M:%S")
    )
    root.addHandler(handler)
