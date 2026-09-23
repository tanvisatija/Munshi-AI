#!/usr/bin/env python3
"""Munshi AI - one-command local setup and run (Windows, macOS, Linux).

    python munshi.py setup     # venv + backend deps, frontend deps + build, seed data
    python munshi.py run       # http://localhost:8000  (API + built web app, one process)
    python munshi.py dev       # hot-reload: API on :8000, Vite on http://localhost:5173
    python munshi.py reseed    # regenerate the synthetic data
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND, FRONTEND = ROOT / "backend", ROOT / "frontend"
VENV = BACKEND / ".venv"
PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
NPM = shutil.which("npm") or "npm"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8"}


def sh(cmd: list[str], cwd: Path) -> None:
    print(f"\n$ {' '.join(map(str, cmd))}   (in {cwd.name}/)")
    subprocess.run(cmd, cwd=cwd, env=ENV, check=True)


def setup() -> None:
    if sys.version_info < (3, 11):
        sys.exit("Python 3.11+ is required.")
    if not PY.exists():
        print("Creating virtualenv at backend/.venv ...")
        venv.create(VENV, with_pip=True)
    sh([str(PY), "-m", "pip", "install", "--upgrade", "pip", "-q"], BACKEND)
    sh([str(PY), "-m", "pip", "install", "-r", "requirements.txt", "-q"], BACKEND)
    sh([NPM, "install", "--no-audit", "--no-fund"], FRONTEND)
    sh([NPM, "run", "build"], FRONTEND)
    sh([str(PY), "seed_data.py"], BACKEND)
    if not (ROOT / ".env").exists():
        shutil.copy(ROOT / ".env.example", ROOT / ".env")
        print("\nCreated .env from .env.example - add ANTHROPIC_API_KEY for live AI (optional).")
    print("\nSetup complete. Start the app with:  python munshi.py run")


def run() -> None:
    if not PY.exists():
        sys.exit("Run `python munshi.py setup` first.")
    print("\nMunshi AI -> http://localhost:8000   (Ctrl+C to stop)")
    sh([str(PY), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], BACKEND)


def dev() -> None:
    api = subprocess.Popen([str(PY), "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"], cwd=BACKEND, env=ENV)
    try:
        print("\nAPI -> http://localhost:8000   Web (hot reload) -> http://localhost:5173")
        subprocess.run([NPM, "run", "dev"], cwd=FRONTEND, env=ENV)
    finally:
        api.terminate()


def reseed() -> None:
    sh([str(PY), "seed_data.py", "--force"], BACKEND)
    print("Restart the server so caches and the churn model pick up the new data.")


if __name__ == "__main__":
    commands = {"setup": setup, "run": run, "dev": dev, "reseed": reseed}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    try:
        commands[sys.argv[1]]()
    except subprocess.CalledProcessError as exc:
        sys.exit(f"Command failed with exit code {exc.returncode}")
    except KeyboardInterrupt:
        pass
