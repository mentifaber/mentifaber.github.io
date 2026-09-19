import sys
from pathlib import Path

# Make the doccrawler package importable when running `pytest doccrawler/tests`
# from the repo root without an editable install.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
