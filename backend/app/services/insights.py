"""LLM-backed features: plain-language summary, grounded chat, regulation-text extraction.

Each one builds a compact facts object from the merchant's computed stats (lightweight
RAG — no vector DB needed at this scope) and has a data-driven mock fallback, so the
output is still specific to the merchant when no LLM is reachable.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from .. import llm
from ..db import get_conn
from ..engine.base import Signal
from ..engine.context import MerchantContext
from ..engine.registry import all_agents
from ..engine.signal_engine import run_signals
from ..engine.stats import health_score
from ..formatting import inr

GUARDRAIL = (
    "Never suggest splitting a payment into smaller transactions, structuring amounts, or any other way to avoid "
    "a fee or regulation. Only compliant levers: ITC recovery, UPI Autopay for genuinely recurring payers, other "
    "payment instruments, pricing decisions, operations and marketing."
)

# ---------------------------------------------------------------------------------------
# Grounding facts
# ---------------------------------------------------------------------------------------


def build_facts(ctx: MerchantContext, pro: bool, signals: list[Signal] | None = None) -> dict[str, Any]:
    signals = signals if signals is not None else run_signals(ctx)
    core = ctx.core
    facts: dict[str, Any] = {
        "merchant": {k: ctx.merchant[k] for k in ("name", "category", "city", "owner_name", "gross_margin_pct")},
        "as_of": core["as_of"],
        "revenue_last_30_days": core["revenue_30d"],
        "revenue_growth_vs_previous_30_days_pct": core["revenue_growth_pct"],
        "payments_last_30_days": core["transactions_30d"],
        "average_ticket_90d": core["avg_ticket_90d"],
        "repeat_customer_pct_90d": core["repeat_customer_pct"],
        "active_customers_90d": core["active_customers_90d"],
        "new_customers_30d": core["new_customers_30d"],
        "regulars_lapsed_45d_plus": core["lapsed_regulars"],
        "volume_breakdown_90d": [{k: b[k] for k in ("label", "count", "value")} for b in core["volume_breakdown"]],
        "business_health_score": health_score(core)["score"],
        "visibility_pct_through_paytm": ctx.merchant.get("visibility_pct"),
    }
    by_agent: dict[str, list[Signal]] = {}
    for s in signals:
        by_agent.setdefault(s.agent_id, []).append(s)
    for agent in all_agents():
        if agent.tier == "pro" and not pro:
            facts[f"{agent.id}_agent"] = "locked (Munshi AI Pro)"
            continue
        facts[f"{agent.id}_agent"] = agent.chat_context(by_agent.get(agent.id, []))
    return facts


# ---------------------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------------------

_SUMMARY_CACHE: dict[tuple[str, str, bool], dict[str, Any]] = {}


def clear_cache() -> None:
    _SUMMARY_CACHE.clear()


def _growth_phrase(g: float | None, hinglish: bool) -> str:
    if g is None:
        return "pichhle mahine jitna" if hinglish else "flat on the previous 30 days"
    if hinglish:
        return f"pichhle 30 din se {abs(g):.1f}% {'zyada' if g >= 0 else 'kam'}"
    return f"{'up' if g >= 0 else 'down'} {abs(g):.1f}% on the previous 30 days"


def mock_summary(ctx: MerchantContext, signals: list[Signal], pro: bool, lang: str) -> str:
    core = ctx.core
    hinglish = lang == "hi"
    reg = next((s for s in signals if s.agent_id == "regulatory"), None)
    churn = next((s for s in signals if s.id == "growth-churn"), None)
    peak = next((s for s in signals if s.id == "growth-peak-hours"), None)
    parts = []
    if hinglish:
        parts.append(
            f"Pichhle 30 din mein {ctx.merchant['name']} ne {core['transactions_30d']:,} payments se "
            f"{inr(core['revenue_30d'])} kamaaye — {_growth_phrase(core['revenue_growth_pct'], True)}. "
            f"Average bill {inr(core['avg_ticket_90d'])} hai, aur {core['repeat_customer_pct']:.0f}% customers dobara aaye."
        )
        if reg and "retrospective" in reg.details.get("impact", {}):
            r = reg.details["impact"]["retrospective"]
            f = reg.details["impact"]["forward_estimate"]
            parts.append(
                f"Dhyan dein: 15 Oct se ₹2,000 se upar ke UPI payments par 0.4% MDR + GST lagega. Aapke pichhle 90 din "
                f"par yeh {inr(r['gross_cost'])} hota, jismein se {inr(r['itc_recoverable'])} ITC se wapas mil sakta hai. "
                f"Agle 3 mahine ka andaaza: {inr(f['net_low'])}–{inr(f['net_high'])}."
            )
        if pro and churn:
            parts.append(f"{churn.title.split(' —')[0]} — ek chhota cashback offer unhe wapas la sakta hai.")
        if pro and peak:
            parts.append(f"Sabse zyada bheed {peak.metrics[0]['value']} mein hoti hai; us waqt extra staff rakhein.")
        if reg and reg.recommendations:
            parts.append(f"Pehla kadam: {reg.recommendations[0].title}.")
    else:
        parts.append(
            f"In the last 30 days {ctx.merchant['name']} took {inr(core['revenue_30d'])} across "
            f"{core['transactions_30d']:,} payments — {_growth_phrase(core['revenue_growth_pct'], False)}. "
            f"Your average bill is {inr(core['avg_ticket_90d'])} and {core['repeat_customer_pct']:.0f}% of recent customers came back."
        )
        if reg and "retrospective" in reg.details.get("impact", {}):
            r = reg.details["impact"]["retrospective"]
            f = reg.details["impact"]["forward_estimate"]
            parts.append(
                f"Heads-up: from 15 Oct, UPI payments above ₹2,000 carry a 0.4% MDR plus GST. On your last 90 days that "
                f"would have been {inr(r['gross_cost'])}, of which {inr(r['itc_recoverable'])} is recoverable as ITC; "
                f"expect {inr(f['net_low'])}–{inr(f['net_high'])} next quarter."
            )
        if pro and churn:
            parts.append(f"{churn.title.split(' —')[0]} — a small cashback offer could bring them back.")
        if pro and peak:
            parts.append(f"Your rush is {peak.metrics[0]['value']}; plan staff and stock around it.")
        if reg and reg.recommendations:
            first = reg.recommendations[0].title
            parts.append(f"Best first move: {first[0].lower() + first[1:]}.")
    return " ".join(parts)


def summary(ctx: MerchantContext, pro: bool, lang: str = "en", refresh: bool = False) -> dict[str, Any]:
    key = (ctx.merchant_id, lang, pro)
    if not refresh and key in _SUMMARY_CACHE:
        return _SUMMARY_CACHE[key]
    signals = run_signals(ctx)
    facts = build_facts(ctx, pro, signals)
    language = (
        "Write in natural Hinglish — Hindi in Roman script mixed with everyday English business words, the way a "
        "shopkeeper in North India texts." if lang == "hi" else "Write in simple English."
    )
    system = (
        "You are Munshi AI, a trusted business copilot for a small Indian merchant who uses Paytm. "
        "Write a 4–5 sentence plain-language summary of how their business is doing and the single most important "
        "thing to act on. Use ONLY numbers present in the facts JSON; write money as ₹ with Indian digit grouping. "
        f"No markdown, no bullet points. {language} {GUARDRAIL}"
    )
    result = llm.complete(
        system,
        [{"role": "user", "content": f"Facts:\n{json.dumps(facts, ensure_ascii=False, default=str)}"}],
        mock=lambda: mock_summary(ctx, signals, pro, lang),
        max_tokens=700,
    )
    out = {"text": result.text, "source": result.source, "lang": lang}
    _SUMMARY_CACHE[key] = out
    return out


# ---------------------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------------------

_HINGLISH = re.compile(r"\b(kya|hai|hain|mera|meri|mere|kitna|kitne|kaise|kyun|nahi|mujhe|karu|karun|batao|dukaan|kab|kaunse|kaun|kahan|aap|wapas|zyada|daam|bheed|lagega|chahiye)\b|[ऀ-ॿ]", re.I)


def mock_chat(ctx: MerchantContext, facts: dict[str, Any], signals: list[Signal], pro: bool, question: str) -> str:
    q = question.lower()
    hi = bool(_HINGLISH.search(q))
    core = ctx.core
    reg = next((s for s in signals if s.agent_id == "regulatory"), None)
    impact = reg.details.get("impact", {}) if reg else {}
    r = impact.get("retrospective", {})
    f = impact.get("forward_estimate", {})
    recs = {rec.id: rec for rec in (reg.recommendations if reg else [])}

    def locked(what: str) -> str:
        return (f"{what} Munshi AI Pro ka feature hai — upgrade karke dekhein." if hi
                else f"{what} is part of Munshi AI Pro — switch on Pro to see it.")

    if re.search(r"autopay|mandate|recurring", q) and "autopay-conversion" in recs:
        rec = recs["autopay-conversion"]
        return (f"{rec.description} Autopay mandates MDR se exempt hain." if hi else
                f"{rec.description} Tap the recommendation on the MDR alert to preview the WhatsApp message.")
    if re.search(r"mdr|fee|gst|itc|rule|charge|regulat|tax|2,?000|15 oct", q) and r:
        if hi:
            return (f"Naya rule: 15 Oct 2026 se ₹2,000 se upar ke P2M UPI payments par 0.4% MDR (max ₹300) + us fee par "
                    f"18% GST. Aapke pichhle 90 din mein {r['affected_transactions']} aise payments the — cost "
                    f"{inr(r['gross_cost'])} hota, jismein {inr(r['itc_recoverable'])} ITC se wapas. Agle quarter ka "
                    f"andaaza {inr(f['net_low'])}–{inr(f['net_high'])} (ITC ke baad).")
        return (f"From 15 Oct 2026, P2M UPI payments above ₹2,000 carry a 0.4% MDR (max ₹300 each) plus 18% GST on that fee. "
                f"In your last 90 days, {r['affected_transactions']} payments qualified: {inr(r['mdr'])} MDR + "
                f"{inr(r['gst'])} GST = {inr(r['gross_cost'])}. The GST is claimable as ITC, so your real cost was "
                f"{inr(r['net_cost_after_itc'])}. Next quarter: {inr(f['net_low'])}–{inr(f['net_high'])} after ITC, "
                f"assuming your next 3 months look like the last 6.")
    if re.search(r"price|pricing|margin|surcharge|daam", q) and "pricing-advisor" in recs:
        rec = recs["pricing-advisor"]
        if hi:
            d = rec.data
            if d["recommended_option"] == "absorb":
                return (f"Daam badhane ki zaroorat nahi. Aapke {d['gross_margin_pct']:.0f}% margin par yeh fee aapke gross "
                        f"profit ka sirf {d['pct_of_gross_profit_total']:.2f}% hai — ise absorb kar lijiye. UPI par alag "
                        f"surcharge mat lagaiye; customers ko kuch extra nahi dena hai.")
            return (f"₹2,000 se upar ke items ka list price {d['breakeven_price_change_pct']:.1f}% badhane se fee poori cover ho "
                    f"jaati hai (typical {inr(d['typical_large_ticket'])} bill par lagbhag "
                    f"{inr(d['typical_large_ticket'] * d['breakeven_price_change_pct'] / 100)}). UPI par alag surcharge mat lagaiye.")
        return f"{rec.title}. {rec.description} {rec.notes[0] if rec.notes else ''}".strip()
    if re.search(r"churn|los[ite]|leav|return|wapas|win.?back|missing|regular|stopped|inactive|at.?risk", q):
        churn = next((s for s in signals if s.id == "growth-churn"), None)
        if not pro:
            return locked("Customer churn prediction")
        if churn and hi:
            m = churn.metrics
            return (f"{m[0]['value']} regular customers 30+ din se wapas nahi aaye. Woh milkar lagbhag {m[1]['value']}/mahina "
                    f"kharch karte the. 15–30% bhi laut aaye to {m[2]['value']}/mahina wapas aa sakta hai. Unhe WhatsApp par "
                    f"10% cashback offer (max ₹{churn.details.get('cashback_cap', 50)}) bhejiye — alert kholkar 'Approve & Send' dabaiye.")
        if churn:
            return f"{churn.title}. {churn.how_it_affects_you} {churn.what_to_do}"
    if re.search(r"peak|busy|rush|staff|hour|time|bheed|quiet", q):
        peak = next((s for s in signals if s.id == "growth-peak-hours"), None)
        if not pro:
            return locked("Peak-hour planning")
        if peak and hi:
            m = peak.metrics
            return (f"Sabse zyada bheed {m[0]['value']} mein hoti hai ({m[0]['hint']}), aur {m[1]['value']} sabse shaant "
                    f"rehta hai ({m[1]['hint']}) — {m[2]['value']} ka fark. Rush se pehle extra staff aur stock rakhiye, aur "
                    f"shaant waqt ke liye chhota cashback offer chalaiye.")
        if peak:
            return f"{peak.title}. {peak.how_it_affects_you} {peak.what_to_do}"
    if re.search(r"compare|benchmark|others|peer|like me", q):
        bench = next((s for s in signals if s.id == "growth-benchmark"), None)
        if not pro:
            return locked("Merchant benchmarks")
        if bench and hi:
            return f"Aap jaise merchants se tulna: {bench.how_it_affects_you} Sujhav: {bench.what_to_do}"
        if bench:
            return f"{bench.title}. {bench.how_it_affects_you} Suggestion: {bench.what_to_do}"
    growth = _growth_phrase(core["revenue_growth_pct"], hi)
    if hi:
        return (f"Pichhle 30 din: {inr(core['revenue_30d'])} ({growth}), {core['transactions_30d']:,} payments, average "
                f"bill {inr(core['avg_ticket_90d'])}, {core['repeat_customer_pct']:.0f}% repeat customers. Aap MDR, "
                f"ITC, Autopay, churn ya peak hours ke baare mein pooch sakte hain.")
    return (f"Last 30 days: {inr(core['revenue_30d'])} ({growth}) from {core['transactions_30d']:,} payments, average "
            f"bill {inr(core['avg_ticket_90d'])}, {core['repeat_customer_pct']:.0f}% repeat customers. Ask me about the "
            f"new MDR rule, ITC, Autopay, customers you're losing, or your peak hours.")


def chat_history(merchant_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, role, content, source, created_at FROM chat_messages WHERE merchant_id = ? ORDER BY id",
            (merchant_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def clear_chat(merchant_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM chat_messages WHERE merchant_id = ?", (merchant_id,))


def _save(merchant_id: str, role: str, content: str, source: str | None) -> dict[str, Any]:
    now = datetime.now().isoformat(timespec="seconds")
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO chat_messages(merchant_id, role, content, source, created_at) VALUES (?,?,?,?,?)",
            (merchant_id, role, content, source, now),
        )
    return {"id": cur.lastrowid, "role": role, "content": content, "source": source, "created_at": now}


def chat(ctx: MerchantContext, pro: bool, question: str) -> dict[str, Any]:
    question = question.strip()[:2000]
    history = chat_history(ctx.merchant_id)[-10:]
    _save(ctx.merchant_id, "user", question, None)
    signals = run_signals(ctx)
    facts = build_facts(ctx, pro, signals)
    system = (
        "You are Munshi AI, a friendly, sharp business copilot for a Paytm merchant in India. Answer the merchant's "
        "question using ONLY the facts JSON below — these are computed from their own transactions. If the facts "
        "don't cover it, say so plainly and suggest what Munshi can tell them. Keep answers under 120 words, "
        "conversational, no markdown headers. Write money as ₹ with Indian digit grouping. Reply in the same "
        "language the merchant uses (English, Hindi or Hinglish). If a feature is marked locked, say it needs "
        f"Munshi AI Pro. {GUARDRAIL}\n\nFacts:\n{json.dumps(facts, ensure_ascii=False, default=str)}"
    )
    messages = [{"role": m["role"], "content": m["content"]} for m in history if m["role"] in ("user", "assistant")]
    messages.append({"role": "user", "content": question})
    result = llm.complete(system, messages, mock=lambda: mock_chat(ctx, facts, signals, pro, question), max_tokens=600)
    return _save(ctx.merchant_id, "assistant", result.text, result.source)


# ---------------------------------------------------------------------------------------
# Regulation text -> structured rule
# ---------------------------------------------------------------------------------------

_NUM = r"(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|crore|k)?"
_MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec"


def _to_number(num: str, unit: str | None) -> float:
    v = float(num.replace(",", ""))
    mult = {"lakh": 1e5, "lac": 1e5, "crore": 1e7, "k": 1e3}.get((unit or "").lower(), 1)
    return v * mult


def _parse_date(text: str) -> str | None:
    t = text.lower()
    patterns = [
        (rf"(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTHS})\.?,?\s+(\d{{4}})", lambda m: f"{m[1]} {m[2][:3]} {m[3]}", "%d %b %Y"),
        (rf"({_MONTHS})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})", lambda m: f"{m[2]} {m[1][:3]} {m[3]}", "%d %b %Y"),
        (r"(\d{4})-(\d{2})-(\d{2})", lambda m: f"{m[1]}-{m[2]}-{m[3]}", "%Y-%m-%d"),
        (r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", lambda m: f"{m[1]}/{m[2]}/{m[3]}", "%d/%m/%Y"),
    ]
    for pat, fmt, parse in patterns:
        m = re.search(pat, t)
        if m:
            try:
                return datetime.strptime(fmt(m), parse).strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def regex_extract(text: str) -> dict[str, Any]:
    """Deterministic fallback extractor — used when no LLM is available or its output is invalid."""
    t = text.lower()
    out: dict[str, Any] = {"name": None, "threshold": None, "rate_pct": None, "cap": None, "no_cap": False, "gst_pct": None,
                           "effective_date": _parse_date(text), "exempt_recurring": None,
                           "small_merchant_monthly_limit": None}
    m = re.search(rf"(?:above|exceeding|more than|over|greater than|in excess of)\s+{_NUM}", t)
    if m:
        out["threshold"] = _to_number(m[1], m[2])
    if re.search(r"\b(?:no|without(?: any)?)\s+(?:cap|ceiling|upper limit|maximum)\b|\buncapped\b", t):
        out["no_cap"] = True
    else:
        m = re.search(rf"\b(?:cap(?:ped)?|maximum|max\.?|ceiling|upper limit)\s*(?:of|at|to)?\s*{_NUM}", t)
        if m:
            out["cap"] = _to_number(m[1], m[2])
    pcts = [(mm.start(), float(mm[1])) for mm in re.finditer(r"(\d+(?:\.\d+)?)\s*(?:%|per ?cent)", t)]
    for pos, val in pcts:
        near = t[max(0, pos - 40): pos + 40]
        if "gst" in near and out["gst_pct"] is None and val >= 5:
            out["gst_pct"] = val
        elif out["rate_pct"] is None:
            out["rate_pct"] = val
    if re.search(r"(autopay|auto-pay|recurring|mandate)", t) and re.search(r"exempt|excluded|not apply|shall not", t):
        out["exempt_recurring"] = True
    m = re.search(rf"small merchants?[^.]*?{_NUM}", t)
    if m:
        out["small_merchant_monthly_limit"] = _to_number(m[1], m[2])
    bits = []
    if out["rate_pct"] is not None:
        bits.append(f"{out['rate_pct']:g}% MDR")
    if out["threshold"] is not None:
        bits.append(f"above ₹{out['threshold']:,.0f}")
    out["name"] = ("UPI " + " ".join(bits)) if bits else "Extracted rule"
    return out


def _parse_json(text: str) -> dict[str, Any] | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def extract_rule(text: str) -> dict[str, Any]:
    text = text.strip()[:6000]
    fallback = regex_extract(text)
    system = (
        "You extract payment-regulation parameters from Indian regulatory text (NPCI/RBI circulars, news). "
        "Return ONLY a JSON object, no prose, with keys: name (short string), threshold (number, rupees — the rule "
        "applies to amounts ABOVE this; null if none), rate_pct (number, percent), cap (number, rupees per "
        "transaction, or null), no_cap (true ONLY if the text explicitly says there is no cap), gst_pct (number or null), effective_date (YYYY-MM-DD or null), exempt_recurring "
        "(boolean or null), small_merchant_monthly_limit (number, rupees, or null), summary (one plain sentence). "
        "Use null for anything the text does not state. Do not invent values."
    )
    result = llm.complete(system, [{"role": "user", "content": text}], mock=lambda: json.dumps(fallback), max_tokens=500)
    parsed = _parse_json(result.text)
    source = result.source if result.source != "mock" else "rule-based parser (offline fallback)"
    if parsed is None:
        parsed, source = fallback, "rule-based parser (LLM output was not valid JSON)"
    clean: dict[str, Any] = {}
    for key in ("threshold", "rate_pct", "cap", "gst_pct", "small_merchant_monthly_limit"):
        v = parsed.get(key)
        try:
            clean[key] = float(v) if v is not None else None
        except (TypeError, ValueError):
            clean[key] = fallback.get(key)
    clean["effective_date"] = parsed.get("effective_date") if _valid_date(parsed.get("effective_date")) else fallback["effective_date"]
    clean["exempt_recurring"] = parsed.get("exempt_recurring") if isinstance(parsed.get("exempt_recurring"), bool) else fallback["exempt_recurring"]
    clean["no_cap"] = bool(parsed.get("no_cap") if isinstance(parsed.get("no_cap"), bool) else fallback["no_cap"]) and clean["cap"] is None
    clean["name"] = str(parsed.get("name") or fallback["name"])[:120]
    clean["summary"] = str(parsed.get("summary") or "")[:300] or None
    missing = [k for k in ("threshold", "rate_pct", "cap", "gst_pct", "effective_date", "exempt_recurring",
                           "small_merchant_monthly_limit") if clean.get(k) is None and not (k == "cap" and clean["no_cap"])]
    usable = clean["threshold"] is not None or clean["rate_pct"] is not None
    return {"rule": clean, "source": source, "missing": missing, "usable": usable}


def _valid_date(v: Any) -> bool:
    if not isinstance(v, str):
        return False
    try:
        datetime.strptime(v, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def agents_info() -> list[dict[str, Any]]:
    return [a.info() for a in all_agents()]


