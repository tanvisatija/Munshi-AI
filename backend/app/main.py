"""Munshi AI — FastAPI entry point.

    uvicorn app.main:app --reload        (from /backend)
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import agents  # noqa: F401  (registers all agent modules)
from . import llm
from .agents.regulatory import DEFAULT_RULE, RuleSpec, compute_impact
from .config import BACKEND_DIR, settings
from .db import get_conn, init_schema, is_pro, set_setting
from .engine import context as engine_context
from .engine.context import build_context, load_merchants
from .engine.signal_engine import feed
from .engine.stats import health_score
from .ml.churn import get_model, reset_model
from .services import actions, documents, insights

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("munshi")


def _seed_if_needed(force: bool = False) -> None:
    sys.path.insert(0, str(BACKEND_DIR))
    from seed_data import seed  # local import: seed_data lives at /backend root

    if seed(force=force):
        engine_context.clear_cache()
        insights.clear_cache()
        reset_model()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_schema()
    from .db import get_setting

    if get_setting("pro_enabled") is None:
        set_setting("pro_enabled", "true" if settings.pro_enabled_default else "false")
    if settings.auto_seed:
        _seed_if_needed()
    try:
        get_model()  # warm the churn model so the first dashboard load is fast
    except Exception:
        log.exception("Churn model warm-up failed; it will retry on first use")
    log.info("LLM provider: %s", llm.provider_status())
    yield


app = FastAPI(title="Munshi AI", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _ctx(merchant_id: str):
    try:
        return build_context(merchant_id)
    except KeyError:
        raise HTTPException(404, f"Unknown merchant {merchant_id}")


# ---------------------------------------------------------------------------------------
# Meta / settings
# ---------------------------------------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "llm": llm.provider_status()}


class SettingsIn(BaseModel):
    pro_enabled: bool


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    return {"pro_enabled": is_pro(), "llm": llm.provider_status(), "agents": insights.agents_info()}


@app.put("/api/settings")
def put_settings(body: SettingsIn) -> dict[str, Any]:
    set_setting("pro_enabled", "true" if body.pro_enabled else "false")
    return get_settings()


@app.get("/api/agents")
def list_agents() -> list[dict[str, Any]]:
    return insights.agents_info()


@app.post("/api/admin/reseed")
def reseed() -> dict[str, Any]:
    _seed_if_needed(force=True)
    return {"ok": True}


# ---------------------------------------------------------------------------------------
# Merchants & dashboard (Layer 1 — Understand)
# ---------------------------------------------------------------------------------------


@app.get("/api/merchants")
def merchants() -> list[dict[str, Any]]:
    out = []
    for m in load_merchants():
        core = build_context(m["id"], with_peers=False).core
        out.append({
            **m,
            "revenue_30d": core["revenue_30d"],
            "transactions_per_day": core["transactions_per_day"],
            "avg_ticket_90d": core["avg_ticket_90d"],
            "health_score": health_score(core)["score"],
        })
    return out


@app.get("/api/merchants/{merchant_id}/dashboard")
def dashboard(merchant_id: str) -> dict[str, Any]:
    ctx = _ctx(merchant_id)
    return {
        "merchant": ctx.merchant,
        "stats": ctx.core,
        "health": health_score(ctx.core),
        "pro_enabled": is_pro(),
    }


class VisibilityIn(BaseModel):
    visibility_pct: int = Field(ge=0, le=100)


@app.put("/api/merchants/{merchant_id}/visibility")
def set_visibility(merchant_id: str, body: VisibilityIn) -> dict[str, Any]:
    _ctx(merchant_id)
    with get_conn() as conn:
        conn.execute("UPDATE merchants SET visibility_pct = ? WHERE id = ?", (body.visibility_pct, merchant_id))
    insights.clear_cache()
    return {"visibility_pct": body.visibility_pct}


@app.get("/api/merchants/{merchant_id}/summary")
def summary(merchant_id: str, lang: str = Query("en", pattern="^(en|hi)$"), refresh: bool = False) -> dict[str, Any]:
    return insights.summary(_ctx(merchant_id), is_pro(), lang, refresh)


# ---------------------------------------------------------------------------------------
# Signals (Layer 2 — Advise)
# ---------------------------------------------------------------------------------------


@app.get("/api/merchants/{merchant_id}/signals")
def signals(merchant_id: str) -> list[dict[str, Any]]:
    return feed(_ctx(merchant_id), is_pro())


@app.get("/api/merchants/{merchant_id}/signals/{signal_id}")
def signal_detail(merchant_id: str, signal_id: str) -> dict[str, Any]:
    for s in feed(_ctx(merchant_id), is_pro()):
        if s["id"] == signal_id:
            return s
    raise HTTPException(404, "Signal not found")


class RegulationText(BaseModel):
    text: str = Field(min_length=20, max_length=6000)


@app.post("/api/regulations/extract")
def extract_regulation(body: RegulationText) -> dict[str, Any]:
    return insights.extract_rule(body.text)


class RuleIn(BaseModel):
    name: str | None = None
    threshold: float | None = Field(default=None, ge=0)
    rate_pct: float | None = Field(default=None, ge=0, le=10)
    cap: float | None = Field(default=None, ge=0)
    no_cap: bool | None = None                # text explicitly says "no cap"
    gst_pct: float | None = Field(default=None, ge=0, le=50)
    effective_date: str | None = None
    exempt_recurring: bool | None = None
    small_merchant_monthly_limit: float | None = Field(default=None, ge=0)


@app.post("/api/merchants/{merchant_id}/regulations/simulate")
def simulate_rule(merchant_id: str, body: RuleIn) -> dict[str, Any]:
    """Apply an arbitrary (e.g. freshly extracted) rule to this merchant's real history."""
    ctx = _ctx(merchant_id)
    if body.threshold is None and body.rate_pct is None:
        raise HTTPException(422, "The rule needs at least a rate or a threshold to simulate.")
    data = body.model_dump()
    no_cap = bool(data.pop("no_cap"))
    rule = RuleSpec.from_dict({**data, "source": "extracted"})
    if no_cap:
        rule.cap = None
    # A field the text didn't mention falls back to the current rule's value; say so explicitly.
    defaulted = [k for k, v in data.items() if v is None and k != "name" and not (k == "cap" and no_cap)]
    try:
        impact = compute_impact(ctx.tx, ctx.as_of, rule)
    except ValueError as exc:
        raise HTTPException(422, f"Could not apply rule: {exc}")
    return {"impact": impact, "defaulted_fields": defaulted, "baseline_rule": DEFAULT_RULE.name}


# ---------------------------------------------------------------------------------------
# Actions (Layer 3 — Act)
# ---------------------------------------------------------------------------------------


class ActionIn(BaseModel):
    signal_id: str
    recommendation_id: str
    message: str | None = Field(default=None, max_length=1000)


def _action_errors(fn, *args):
    try:
        return fn(*args)
    except actions.ProRequired as exc:
        raise HTTPException(402, str(exc))
    except actions.NotFound as exc:
        raise HTTPException(404, str(exc))
    except actions.InvalidState as exc:
        raise HTTPException(409, str(exc))


@app.post("/api/merchants/{merchant_id}/actions")
def run_action(merchant_id: str, body: ActionIn) -> dict[str, Any]:
    _ctx(merchant_id)
    return _action_errors(actions.execute, merchant_id, body.signal_id, body.recommendation_id, body.message)


@app.get("/api/merchants/{merchant_id}/actions")
def list_actions(merchant_id: str) -> list[dict[str, Any]]:
    return actions.list_actions(merchant_id)


@app.post("/api/actions/{action_id}/confirm")
def confirm_action(action_id: int) -> dict[str, Any]:
    return _action_errors(actions.confirm, action_id)


@app.post("/api/actions/{action_id}/cancel")
def cancel_action(action_id: int) -> dict[str, Any]:
    return _action_errors(actions.cancel, action_id)


@app.get("/api/merchants/{merchant_id}/documents/itc.{fmt}")
def itc_document(merchant_id: str, fmt: str) -> FileResponse:
    ctx = _ctx(merchant_id)
    if fmt == "csv":
        path = documents.itc_csv(ctx)
        return FileResponse(path, media_type="text/csv", filename=path.name)
    if fmt == "pdf":
        path = documents.itc_pdf(ctx)
        return FileResponse(path, media_type="application/pdf", filename=path.name)
    raise HTTPException(404, "Format must be csv or pdf")


# ---------------------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------------------


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@app.get("/api/merchants/{merchant_id}/chat")
def get_chat(merchant_id: str) -> list[dict[str, Any]]:
    return insights.chat_history(merchant_id)


@app.post("/api/merchants/{merchant_id}/chat")
def post_chat(merchant_id: str, body: ChatIn) -> dict[str, Any]:
    return insights.chat(_ctx(merchant_id), is_pro(), body.message)


@app.delete("/api/merchants/{merchant_id}/chat")
def delete_chat(merchant_id: str) -> dict[str, Any]:
    insights.clear_chat(merchant_id)
    return {"ok": True}


# ---------------------------------------------------------------------------------------
# Built frontend (single-process local run). In Docker, nginx serves the frontend instead.
# ---------------------------------------------------------------------------------------

_dist: Path = settings.frontend_dist
if (_dist / "index.html").exists():
    if (_dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = (_dist / full_path).resolve()
        if full_path and candidate.is_file() and _dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
