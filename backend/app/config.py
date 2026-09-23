"""Environment-based configuration. No secrets live in code — everything comes from
env vars (optionally loaded from a `.env` file at the repo root or in /backend)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

# Repo-root .env first, then backend/.env; real env vars always win (override=False).
load_dotenv(REPO_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")


def _env(name: str, default: str = "") -> str:
    """Like os.getenv, but a blank value (e.g. `DATABASE_PATH=` in .env) means "use the default"."""
    raw = os.getenv(name, "").strip()
    return raw or default


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str, default: str) -> list[str]:
    return [item.strip() for item in _env(name, default).split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # LLM — both optional. With neither set, every LLM feature uses its mock fallback.
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY", ""))
    anthropic_model: str = field(default_factory=lambda: _env("ANTHROPIC_MODEL", "claude-opus-5"))
    anthropic_effort: str = field(default_factory=lambda: _env("ANTHROPIC_EFFORT", "low"))
    openai_api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY", ""))
    openai_model: str = field(default_factory=lambda: _env("OPENAI_MODEL", "gpt-4.1-mini"))
    # "auto" = Anthropic -> OpenAI -> mock. "mock" forces offline mode (handy for demos without Wi-Fi).
    llm_provider: str = field(default_factory=lambda: _env("LLM_PROVIDER", "auto").lower())
    llm_timeout_seconds: float = field(default_factory=lambda: float(_env("LLM_TIMEOUT_SECONDS", "25")))

    database_path: Path = field(
        default_factory=lambda: Path(_env("DATABASE_PATH", str(BACKEND_DIR / "data" / "munshi.db")))
    )
    exports_dir: Path = field(
        default_factory=lambda: Path(_env("EXPORTS_DIR", str(BACKEND_DIR / "data" / "exports")))
    )
    # Seed on startup when the DB is empty, so a fresh container "just works".
    auto_seed: bool = field(default_factory=lambda: _bool("AUTO_SEED", True))
    # Optional fixed anchor date for the synthetic data (YYYY-MM-DD). Defaults to today.
    seed_end_date: str = field(default_factory=lambda: _env("SEED_END_DATE", ""))
    # Initial value of the Munshi AI Pro demo toggle.
    pro_enabled_default: bool = field(default_factory=lambda: _bool("PRO_ENABLED_DEFAULT", False))

    cors_origins: list[str] = field(
        default_factory=lambda: _list("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    )
    # If this folder exists (a built frontend), the API also serves the web app from "/".
    frontend_dist: Path = field(
        default_factory=lambda: Path(_env("FRONTEND_DIST", str(REPO_DIR / "frontend" / "dist")))
    )


settings = Settings()
