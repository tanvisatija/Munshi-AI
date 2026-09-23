"""SQLite access. Plain sqlite3 keeps the footprint tiny and the file portable."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    persona TEXT NOT NULL,
    city TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    gross_margin_pct REAL NOT NULL,       -- merchant's own margin, used by the pricing advisor
    visibility_pct INTEGER                -- Business Visibility Score (merchant-entered)
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id),
    customer_id TEXT NOT NULL,
    amount REAL NOT NULL,
    timestamp TEXT NOT NULL,              -- ISO-8601, local time (IST)
    is_recurring INTEGER NOT NULL,        -- 1 = UPI Autopay / mandate
    channel TEXT NOT NULL                 -- upi_qr | upi_intent | upi_collect | upi_autopay
);
CREATE INDEX IF NOT EXISTS idx_tx_merchant_ts ON transactions(merchant_id, timestamp);

CREATE TABLE IF NOT EXISTS actions_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    signal_id TEXT NOT NULL,
    recommendation_id TEXT NOT NULL,
    action_type TEXT NOT NULL,            -- message | document | pricing | setting
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    execution_mode TEXT NOT NULL,         -- auto | approval
    status TEXT NOT NULL,                 -- executed | pending_confirmation | cancelled
    payload TEXT,                         -- JSON
    artifact_path TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.database_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_schema() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def get_setting(key: str, default: str | None = None) -> str | None:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO app_settings(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def is_pro() -> bool:
    return get_setting("pro_enabled", "false") == "true"
