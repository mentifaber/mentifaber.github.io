"""
rig_control.py — Hamlib rigctld TCP interface
Talks to rigctld daemon (port 4532 by default) which abstracts 283+ radios.

rigctld protocol (plain text TCP):
  Send:    "F 14250000\n"          → set freq
  Send:    "f\n"                   → get freq
  Send:    "M USB 2400\n"          → set mode + passband
  Send:    "m\n"                   → get mode
  Send:    "T 1\n"                 → PTT on
  Send:    "T 0\n"                 → PTT off
  Receive: "RPRT 0\n"              → success
  Receive: "14250000\nRPRT 0\n"    → value + success
  Receive: "RPRT -1\n"             → error
"""

import socket
import threading
import time
import logging
import json
import os
import asyncio
from typing import Optional, Callable

log = logging.getLogger("RigControl")

# ─── VARA HF bands and default VARA calling frequencies ──────────────────────
VARA_BANDS = {
    "80m":  {"freq_hz": 3_591_000,  "mode": "USB", "label": "80m  3.591 MHz"},
    "40m":  {"freq_hz": 7_047_000,  "mode": "USB", "label": "40m  7.047 MHz"},
    "30m":  {"freq_hz": 10_147_000, "mode": "USB", "label": "30m  10.147 MHz"},
    "20m":  {"freq_hz": 14_105_000, "mode": "USB", "label": "20m  14.105 MHz (main CF)"},
    "17m":  {"freq_hz": 18_111_000, "mode": "USB", "label": "17m  18.111 MHz"},
    "15m":  {"freq_hz": 21_405_000, "mode": "USB", "label": "15m  21.405 MHz"},
    "12m":  {"freq_hz": 24_927_000, "mode": "USB", "label": "12m  24.927 MHz"},
    "10m":  {"freq_hz": 28_225_000, "mode": "USB", "label": "10m  28.225 MHz"},
}

PTT_METHODS = ["CAT", "DTR", "RTS", "VOX", "NONE"]

class RigState:
    connected: bool = False
    freq_hz: int = 0
    mode: str = ""
    passband: int = 0
    ptt: bool = False
    rig_id: int = 1          # Hamlib model ID
    rig_name: str = "Dummy"
    port: str = "/dev/ttyUSB0"
    baud: int = 9600
    ptt_method: str = "CAT"
    rigctld_host: str = "127.0.0.1"
    rigctld_port: int = 4532
    rigctld_running: bool = False

class RigController:
    def __init__(self, on_state_change: Optional[Callable] = None):
        self.state = RigState()
        self._sock: Optional[socket.socket] = None
        self._lock = threading.Lock()
        self._poll_thread: Optional[threading.Thread] = None
        self._running = False
        self._on_state_change = on_state_change   # async callback → broadcast
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        self._event_loop = loop

    # ─── rigctld connection ────────────────────────────────────────────────
    def connect(self, host: str = "127.0.0.1", port: int = 4532) -> tuple[bool, str]:
        """Connect to a running rigctld instance."""
        self.state.rigctld_host = host
        self.state.rigctld_port = port
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(4)
            s.connect((host, port))
            s.settimeout(3)
            with self._lock:
                self._sock = s
            # Quick probe — get current freq
            freq = self._cmd("f")
            if freq is None:
                self._sock = None
                return False, "rigctld connected but no response to 'f'"
            self.state.connected = True
            self.state.rigctld_running = True
            log.info(f"rigctld connected at {host}:{port}, freq={freq}")
            self._start_poll()
            return True, f"Connected — rig at {freq} Hz"
        except Exception as e:
            log.warning(f"rigctld connect failed: {e}")
            return False, str(e)

    def disconnect(self):
        self._running = False
        self.state.connected = False
        self.state.rigctld_running = False
        with self._lock:
            if self._sock:
                try: self._sock.close()
                except: pass
                self._sock = None

    # ─── low-level TCP command ─────────────────────────────────────────────
    def _cmd(self, cmd: str) -> Optional[str]:
        """Send one command, return response lines (stripped, no RPRT line)."""
        with self._lock:
            if not self._sock:
                return None
            try:
                payload = (cmd.strip() + "\n").encode()
                self._sock.sendall(payload)
                resp = b""
                while True:
                    chunk = self._sock.recv(256)
                    if not chunk:
                        break
                    resp += chunk
                    if b"RPRT" in resp:
                        break
                decoded = resp.decode(errors="replace").strip()
                log.debug(f"rigctld ← {cmd!r} → {decoded!r}")
                # Strip trailing RPRT line, return value lines only
                lines = [l for l in decoded.split("\n")
                         if l and not l.startswith("RPRT")]
                if decoded.endswith("RPRT 0") or "RPRT 0" in decoded:
                    return "\n".join(lines) if lines else "OK"
                else:
                    log.warning(f"rigctld error response: {decoded!r}")
                    return None
            except Exception as e:
                log.error(f"rigctld _cmd error ({cmd!r}): {e}")
                self.state.connected = False
                return None

    # ─── rig operations ────────────────────────────────────────────────────
    def get_freq(self) -> Optional[int]:
        r = self._cmd("f")
        if r and r.strip().isdigit():
            self.state.freq_hz = int(r.strip())
            return self.state.freq_hz
        return None

    def set_freq(self, freq_hz: int) -> bool:
        r = self._cmd(f"F {int(freq_hz)}")
        if r is not None:
            self.state.freq_hz = freq_hz
            self._notify()
            return True
        return False

    def get_mode(self) -> Optional[tuple[str, int]]:
        r = self._cmd("m")
        if r:
            parts = r.strip().split("\n")
            if len(parts) >= 2:
                self.state.mode = parts[0].strip()
                try:
                    self.state.passband = int(parts[1].strip())
                except:
                    self.state.passband = 0
                return self.state.mode, self.state.passband
        return None

    def set_mode(self, mode: str, passband: int = 0) -> bool:
        r = self._cmd(f"M {mode} {passband}")
        if r is not None:
            self.state.mode = mode
            self.state.passband = passband
            self._notify()
            return True
        return False

    def set_ptt(self, on: bool) -> bool:
        r = self._cmd(f"T {'1' if on else '0'}")
        if r is not None:
            self.state.ptt = on
            self._notify()
            return True
        return False

    def get_ptt(self) -> Optional[bool]:
        r = self._cmd("t")
        if r and r.strip() in ("0", "1"):
            self.state.ptt = r.strip() == "1"
            return self.state.ptt
        return None

    def tune_vara_band(self, band_key: str) -> tuple[bool, str]:
        """Jump to a VARA calling frequency + set USB mode."""
        band = VARA_BANDS.get(band_key)
        if not band:
            return False, f"Unknown band: {band_key}"
        ok_f = self.set_freq(band["freq_hz"])
        ok_m = self.set_mode(band["mode"], 0)
        if ok_f and ok_m:
            return True, f"Tuned to {band['label']}"
        return False, "Partial tune — check rig connection"

    def dump_caps(self) -> str:
        """Return raw dump_caps output for diagnostics."""
        r = self._cmd("\\dump_caps")
        return r or "(no response)"

    def snapshot(self) -> dict:
        return {
            "connected": self.state.connected,
            "freq_hz": self.state.freq_hz,
            "freq_mhz": round(self.state.freq_hz / 1_000_000, 6) if self.state.freq_hz else 0,
            "mode": self.state.mode,
            "passband": self.state.passband,
            "ptt": self.state.ptt,
            "rig_id": self.state.rig_id,
            "rig_name": self.state.rig_name,
            "port": self.state.port,
            "baud": self.state.baud,
            "ptt_method": self.state.ptt_method,
            "rigctld_host": self.state.rigctld_host,
            "rigctld_port": self.state.rigctld_port,
            "rigctld_running": self.state.rigctld_running,
            "vara_bands": VARA_BANDS,
        }

    # ─── polling ───────────────────────────────────────────────────────────
    def _start_poll(self):
        self._running = True
        self._poll_thread = threading.Thread(
            target=self._poll_loop, daemon=True, name="rig-poll"
        )
        self._poll_thread.start()

    def _poll_loop(self):
        log.info("Rig poll loop started")
        consecutive_errors = 0
        while self._running:
            try:
                freq = self.get_freq()
                if freq is None:
                    consecutive_errors += 1
                    if consecutive_errors >= 5:
                        log.error("Rig poll: 5 consecutive failures, marking disconnected")
                        self.state.connected = False
                        self._notify()
                        break
                else:
                    consecutive_errors = 0
                    self.get_mode()
                    self._notify()
                time.sleep(2)
            except Exception as e:
                log.error(f"Poll loop exception: {e}")
                consecutive_errors += 1
                time.sleep(2)

    def _notify(self):
        if self._on_state_change and self._event_loop:
            asyncio.run_coroutine_threadsafe(
                self._on_state_change(self.snapshot()),
                self._event_loop
            )

    # ─── rigctld process launcher ──────────────────────────────────────────
    def launch_rigctld(self, rig_id: int, rig_port: str, baud: int,
                       ptt_method: str, civaddr: str = "") -> tuple[bool, str]:
        """
        Launch rigctld as a subprocess.
        Returns (success, message).
        The caller must then call connect() after a short delay.
        """
        import subprocess, shutil
        rigctld_bin = shutil.which("rigctld")
        if not rigctld_bin:
            return False, (
                "rigctld not found on PATH.\n"
                "Windows: download Hamlib from https://github.com/Hamlib/Hamlib/releases\n"
                "Linux:   sudo apt install libhamlib-utils\n"
                "macOS:   brew install hamlib"
            )

        cmd = [
            rigctld_bin,
            "-m", str(rig_id),
            "-r", rig_port,
            "-s", str(baud),
            "-T", "127.0.0.1",
            "-t", str(self.state.rigctld_port),
        ]

        # PTT method
        if ptt_method == "DTR":
            cmd += ["-P", "DTR"]
        elif ptt_method == "RTS":
            cmd += ["-P", "RTS"]
        elif ptt_method == "CAT":
            cmd += ["-P", "RIG"]
        elif ptt_method == "NONE":
            cmd += ["-P", "NONE"]
        # VOX = no PTT flag, VARA handles it

        # CI-V address for Icom
        if civaddr:
            cmd += ["-C", f"civaddr={civaddr}"]

        log.info(f"Launching rigctld: {' '.join(cmd)}")

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            time.sleep(1.5)  # let it start
            if proc.poll() is not None:
                err = proc.stderr.read().decode(errors="replace")
                return False, f"rigctld exited immediately: {err}"

            self.state.rig_id = rig_id
            self.state.port = rig_port
            self.state.baud = baud
            self.state.ptt_method = ptt_method
            return True, f"rigctld started (PID {proc.pid})"
        except Exception as e:
            return False, f"Failed to launch rigctld: {e}"


# ─── Rig database ─────────────────────────────────────────────────────────────
_RIG_LIST: Optional[list] = None

def load_rig_list() -> list:
    global _RIG_LIST
    if _RIG_LIST is not None:
        return _RIG_LIST
    path = os.path.join(os.path.dirname(__file__), "rig_list.json")
    if os.path.exists(path):
        with open(path) as f:
            _RIG_LIST = json.load(f)
    else:
        # Fallback: run rigctl -l live
        import subprocess, re
        try:
            raw = subprocess.check_output(
                ["rigctl", "-l"], stderr=subprocess.DEVNULL
            ).decode()
            rigs = []
            for line in raw.strip().split("\n")[1:]:
                cols = re.split(r"\s{2,}", line.strip())
                if len(cols) < 4:
                    continue
                try:
                    rigs.append({
                        "id": int(cols[0]),
                        "mfg": cols[1],
                        "model": cols[2],
                        "status": cols[4] if len(cols) > 4 else cols[3],
                    })
                except:
                    pass
            _RIG_LIST = rigs
        except Exception as e:
            log.warning(f"Could not load rig list: {e}")
            _RIG_LIST = [
                {"id": 1,    "mfg": "Hamlib",  "model": "Dummy",      "status": "Stable"},
                {"id": 2,    "mfg": "Hamlib",  "model": "NET rigctl", "status": "Stable"},
                {"id": 1036, "mfg": "Icom",    "model": "IC-7300",    "status": "Stable"},
                {"id": 1040, "mfg": "Yaesu",   "model": "FTdx101D",   "status": "Stable"},
                {"id": 2014, "mfg": "Kenwood",  "model": "TS-2000",   "status": "Stable"},
            ]
    return _RIG_LIST
