"""MerchantContext — the single object every agent reads from.

It loads the merchant's own transactions once (cached per merchant) and exposes
pre-computed business stats, so agents never touch the database directly.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property
from threading import Lock
from typing import Any

import pandas as pd

from ..db import get_conn
from . import stats

_TX_CACHE: dict[str, pd.DataFrame] = {}
_LOCK = Lock()


def clear_cache() -> None:
    with _LOCK:
        _TX_CACHE.clear()


def load_transactions(merchant_id: str) -> pd.DataFrame:
    with _LOCK:
        if merchant_id in _TX_CACHE:
            return _TX_CACHE[merchant_id]
    with get_conn() as conn:
        df = pd.read_sql_query(
            "SELECT transaction_id, merchant_id, customer_id, amount, timestamp, is_recurring, channel "
            "FROM transactions WHERE merchant_id = ? ORDER BY timestamp",
            conn,
            params=(merchant_id,),
        )
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["is_recurring"] = df["is_recurring"].astype(bool)
    with _LOCK:
        _TX_CACHE[merchant_id] = df
    return df


def load_merchants() -> list[dict[str, Any]]:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM merchants ORDER BY id").fetchall()]


def load_merchant(merchant_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM merchants WHERE id = ?", (merchant_id,)).fetchone()
    return dict(row) if row else None


@dataclass
class MerchantContext:
    merchant: dict[str, Any]
    tx: pd.DataFrame
    as_of: pd.Timestamp
    peers: list[dict[str, Any]] = field(default_factory=list)   # other merchants (for benchmarks)

    @property
    def merchant_id(self) -> str:
        return self.merchant["id"]

    @cached_property
    def core(self) -> dict[str, Any]:
        return stats.core_stats(self.tx, self.as_of)

    def peer_contexts(self) -> list["MerchantContext"]:
        return [build_context(p["id"], with_peers=False) for p in self.peers]


def build_context(merchant_id: str, with_peers: bool = True) -> MerchantContext:
    merchant = load_merchant(merchant_id)
    if merchant is None:
        raise KeyError(merchant_id)
    tx = load_transactions(merchant_id)
    as_of = stats.as_of_date(tx)
    peers = [m for m in load_merchants() if m["id"] != merchant_id] if with_peers else []
    return MerchantContext(merchant=merchant, tx=tx, as_of=as_of, peers=peers)
