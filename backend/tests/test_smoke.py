"""End-to-end smoke test: every endpoint, all merchants, both tiers, every action.

    pip install -r requirements-dev.txt
    pytest -q                    (from /backend)

Runs against a throwaway database in offline (mock LLM) mode, so it needs no keys.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="munshi-test-")
os.environ.update({
    "LLM_PROVIDER": "mock",
    "DATABASE_PATH": str(Path(_TMP) / "test.db"),
    "EXPORTS_DIR": str(Path(_TMP) / "exports"),
    "AUTO_SEED": "true",
})
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

MDR_TEXT = (
    "With effect from 15 October 2026, a Merchant Discount Rate (MDR) of 0.4% shall be levied on P2M UPI "
    "transactions above ₹2,000, capped at ₹300 per transaction. GST at 18% is applicable on the MDR. Recurring "
    "payments through UPI AutoPay mandates are exempt, as are small merchants receiving up to ₹1 lakh per month via UPI QR."
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def merchant_ids(client):
    ms = client.get("/api/merchants").json()
    assert len(ms) == 3
    return [m["id"] for m in ms]


def set_pro(client, on: bool):
    assert client.put("/api/settings", json={"pro_enabled": on}).status_code == 200


def test_dashboard_and_summary(client, merchant_ids):
    for mid in merchant_ids:
        d = client.get(f"/api/merchants/{mid}/dashboard").json()
        assert 0 <= d["health"]["score"] <= 100
        assert {b["key"] for b in d["stats"]["volume_breakdown"]} == {"small", "large_one_off", "recurring"}
        for lang in ("en", "hi"):
            s = client.get(f"/api/merchants/{mid}/summary?lang={lang}&refresh=true").json()
            assert s["text"] and s["source"] == "mock"


def test_mdr_math_is_exact(client, merchant_ids):
    """Recompute the retrospective cost independently from the rule definition."""
    from app.engine.context import build_context
    from app.engine.stats import window

    for mid in merchant_ids:
        ctx = build_context(mid)
        last90 = window(ctx.tx, ctx.as_of, 90)
        hit = last90[(last90["amount"] > 2000) & (~last90["is_recurring"])]
        mdr = sum(round(min(a * 0.004, 300), 2) for a in hit["amount"])
        sig = client.get(f"/api/merchants/{mid}/signals/reg-upi-mdr").json()
        retro = sig["details"]["impact"]["retrospective"]
        assert retro["affected_transactions"] == len(hit)
        assert abs(retro["mdr"] - mdr) < 0.05
        assert abs(retro["gst"] - mdr * 0.18) < 1.0
        fwd = sig["details"]["impact"]["forward_estimate"]
        assert fwd["net_low"] <= fwd["net_high"] and fwd["assumption"]


def test_free_tier_is_gated(client, merchant_ids):
    set_pro(client, False)
    for mid in merchant_ids:
        feed = client.get(f"/api/merchants/{mid}/signals").json()
        growth = [s for s in feed if s["agent_id"] == "growth"]
        assert growth and all(s["locked"] and "recommendations" not in s for s in growth)
        r = client.post(f"/api/merchants/{mid}/actions", json={"signal_id": "reg-upi-mdr", "recommendation_id": "itc-summary"})
        assert r.status_code == 402


def test_every_action_on_pro(client, merchant_ids):
    set_pro(client, True)
    for mid in merchant_ids:
        for s in client.get(f"/api/merchants/{mid}/signals").json():
            assert not s["locked"]
            for rec in s["recommendations"]:
                r = client.post(f"/api/merchants/{mid}/actions", json={"signal_id": s["id"], "recommendation_id": rec["id"]})
                assert r.status_code == 200, r.text
                entry = r.json()
                if rec["action"]["type"] == "pricing":
                    # Pricing is never auto-applied.
                    assert entry["status"] == "pending_confirmation" and entry["execution_mode"] == "approval"
                    assert client.post(f"/api/actions/{entry['id']}/confirm").json()["status"] == "executed"
                    assert client.post(f"/api/actions/{entry['id']}/confirm").status_code == 409
                else:
                    assert entry["status"] == "executed"
        log = client.get(f"/api/merchants/{mid}/actions").json()
        assert log and all(e["mode_label"] in ("Auto-executed", "Needs your approval") for e in log)


def test_documents(client, merchant_ids):
    for mid in merchant_ids:
        pdf = client.get(f"/api/merchants/{mid}/documents/itc.pdf")
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
        csv = client.get(f"/api/merchants/{mid}/documents/itc.csv")
        assert csv.status_code == 200 and "itc_claimable_inr" in csv.text


def test_chat(client, merchant_ids):
    for mid in merchant_ids:
        for q in ["mdr kitna lagega?", "who is not coming back", "peak hours", "should I raise prices", "autopay", "hello"]:
            r = client.post(f"/api/merchants/{mid}/chat", json={"message": q})
            assert r.status_code == 200 and r.json()["content"]
        assert len(client.get(f"/api/merchants/{mid}/chat").json()) >= 12
        assert client.delete(f"/api/merchants/{mid}/chat").status_code == 200


def test_regulation_extract_and_simulate(client):
    r = client.post("/api/regulations/extract", json={"text": MDR_TEXT}).json()
    rule = r["rule"]
    assert (rule["threshold"], rule["rate_pct"], rule["cap"], rule["gst_pct"], rule["effective_date"]) == (
        2000, 0.4, 300, 18, "2026-10-15")
    sim = client.post("/api/merchants/M001/regulations/simulate", json={k: v for k, v in rule.items() if k != "summary"})
    base = client.get("/api/merchants/M001/signals/reg-upi-mdr").json()["details"]["impact"]["retrospective"]
    assert sim.json()["impact"]["retrospective"]["gross_cost"] == base["gross_cost"]

    no_cap = client.post("/api/regulations/extract", json={"text": "From March 1, 2027 an MDR of 0.25% applies to UPI payments over INR 10k with no cap."}).json()
    assert no_cap["rule"]["no_cap"] and no_cap["rule"]["threshold"] == 10000

    vague = client.post("/api/regulations/extract", json={"text": "The government may change digital payment charges soon."}).json()
    assert vague["usable"] is False
    assert client.post("/api/merchants/M001/regulations/simulate", json={"effective_date": "2027-01-01"}).status_code == 422


def test_bad_inputs(client):
    assert client.get("/api/merchants/NOPE/dashboard").status_code == 404
    assert client.get("/api/merchants/M001/signals/nope").status_code == 404
    assert client.post("/api/merchants/M001/actions", json={"signal_id": "x", "recommendation_id": "y"}).status_code == 404
    assert client.put("/api/merchants/M001/visibility", json={"visibility_pct": 150}).status_code == 422
    assert client.get("/api/merchants/M001/summary?lang=fr").status_code == 422
    assert client.post("/api/merchants/M001/chat", json={"message": ""}).status_code == 422
    assert client.post("/api/merchants/M001/regulations/simulate", json={"rate_pct": 0.3, "effective_date": "soon"}).status_code == 422


def test_llm_failure_falls_back(monkeypatch):
    from app import llm
    from app.config import settings

    object.__setattr__(settings, "anthropic_api_key", "sk-ant-invalid")
    object.__setattr__(settings, "llm_provider", "auto")

    def boom(*_a, **_k):
        raise ConnectionError("network down")

    monkeypatch.setattr(llm, "_anthropic", boom)
    try:
        r = llm.complete("s", [{"role": "user", "content": "hi"}], mock="fallback text")
        assert (r.text, r.source) == ("fallback text", "mock")
    finally:
        object.__setattr__(settings, "anthropic_api_key", "")
        object.__setattr__(settings, "llm_provider", "mock")
