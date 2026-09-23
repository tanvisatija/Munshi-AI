"""Layer 3 — Act. Executes approved recommendations and keeps the Actions Log.

Guardrails enforced here (not in agents, so no agent can bypass them):
  * Every action requires Munshi AI Pro.
  * Recommendations are looked up server-side from a fresh engine run — the client can
    only reference a recommendation by id, never inject its own action.
  * Pricing actions are never auto-applied: they are logged as `pending_confirmation`
    and only become `executed` after an explicit second confirmation by the merchant.
  * Messages are simulated (logged + previewed), never sent to a real WhatsApp API.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from ..db import get_conn, is_pro
from ..engine.base import Recommendation, Signal
from ..engine.context import build_context
from ..engine.signal_engine import run_signals
from . import documents


class ProRequired(Exception):
    pass


class NotFound(Exception):
    pass


class InvalidState(Exception):
    pass


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _row(r) -> dict[str, Any]:
    d = dict(r)
    d["payload"] = json.loads(d["payload"]) if d.get("payload") else {}
    d["mode_label"] = "Auto-executed" if d["execution_mode"] == "auto" else "Needs your approval"
    return d


def _find(merchant_id: str, signal_id: str, rec_id: str) -> tuple[Any, Signal, Recommendation]:
    ctx = build_context(merchant_id)
    for s in run_signals(ctx):
        if s.id == signal_id:
            for r in s.recommendations:
                if r.id == rec_id:
                    return ctx, s, r
    raise NotFound(f"Recommendation {signal_id}/{rec_id} not found for {merchant_id}")


def execute(merchant_id: str, signal_id: str, rec_id: str, message: str | None = None) -> dict[str, Any]:
    if not is_pro():
        raise ProRequired("Approve & Send is a Munshi AI Pro feature.")
    ctx, signal, rec = _find(merchant_id, signal_id, rec_id)
    spec = rec.action
    mode, status, artifact, payload = spec.execution_mode, "executed", None, dict(spec.params)

    if spec.type == "message":
        body = (message or spec.preview or "").strip()
        payload.update({"channel": spec.channel, "recipients": spec.recipients, "message": body})
        n = len(spec.recipients)
        detail = f"Sent to {spec.recipients[0] if n == 1 else f'{n} customers'} via {spec.channel}: “{body[:140]}{'…' if len(body) > 140 else ''}”"
    elif spec.type == "document":
        csv_path, pdf_path = documents.itc_csv(ctx), documents.itc_pdf(ctx)
        artifact = str(pdf_path)
        payload["downloads"] = spec.downloads
        detail = f"Generated {csv_path.name} and {pdf_path.name} — ready for your CA / GST return."
    elif spec.type == "pricing":
        mode, status = "approval", "pending_confirmation"   # hard rule: never auto-apply pricing
        pct = spec.params.get("price_change_pct") or 0
        what = (f"raise list prices by {pct:.1f}% on items/services above ₹{spec.params.get('applies_above', 2000):,}"
                if pct else "keep list prices unchanged and absorb the MDR")
        detail = f"Proposed: {what}. Waiting for your explicit confirmation."
    else:  # setting
        detail = f"Applied: {spec.preview}" if mode == "auto" else f"Approved: {spec.preview}"

    now = _now()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO actions_log(merchant_id, created_at, updated_at, agent_id, signal_id, recommendation_id, "
            "action_type, title, detail, execution_mode, status, payload, artifact_path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (merchant_id, now, now, signal.agent_id, signal.id, rec.id, spec.type, rec.title, detail, mode, status,
             json.dumps(payload, ensure_ascii=False), artifact),
        )
        row = conn.execute("SELECT * FROM actions_log WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _row(row)


def _transition(action_id: int, to_status: str, prefix: str) -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM actions_log WHERE id = ?", (action_id,)).fetchone()
        if row is None:
            raise NotFound(f"Action {action_id} not found")
        if row["status"] != "pending_confirmation":
            raise InvalidState(f"Action {action_id} is already {row['status']}")
        proposal = row["detail"].replace("Proposed: ", "").replace(" Waiting for your explicit confirmation.", "")
        conn.execute(
            "UPDATE actions_log SET status = ?, updated_at = ?, detail = ? WHERE id = ?",
            (to_status, _now(), f"{prefix} {proposal}", action_id),
        )
        return _row(conn.execute("SELECT * FROM actions_log WHERE id = ?", (action_id,)).fetchone())


def confirm(action_id: int) -> dict[str, Any]:
    if not is_pro():
        raise ProRequired("Confirming actions is a Munshi AI Pro feature.")
    return _transition(action_id, "executed", "Confirmed by merchant:")


def cancel(action_id: int) -> dict[str, Any]:
    return _transition(action_id, "cancelled", "Cancelled by merchant, no change made. Proposal was:")


def list_actions(merchant_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM actions_log WHERE merchant_id = ? ORDER BY id DESC", (merchant_id,)
        ).fetchall()
    return [_row(r) for r in rows]
