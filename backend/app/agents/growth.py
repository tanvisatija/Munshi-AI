"""Growth Opportunity Agent — churn win-back, peak-hour planning, peer benchmarks.

Pro-tier module: free merchants see the headline of each opportunity, Pro unlocks the
detail and the one-tap actions.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from ..engine.base import ActionSpec, AgentModule, Recommendation, Signal
from ..engine.context import MerchantContext
from ..engine.registry import register_agent
from ..engine.stats import window
from ..formatting import customer_label, inr
from ..ml.churn import get_model

RISK_THRESHOLD = 0.6
MIN_DAYS_AWAY = 30
MAX_DAYS_AWAY = 150   # beyond this they're gone, not "at risk"


def _hour_label(h: int) -> str:
    h %= 24
    return f"{(h % 12) or 12}{'am' if h < 12 else 'pm'}"


def benchmark_metrics(ctx: MerchantContext) -> dict[str, float]:
    core = ctx.core
    last90 = window(ctx.tx, ctx.as_of, 90)
    recurring_share = float(last90.loc[last90["is_recurring"], "amount"].sum() / (last90["amount"].sum() or 1) * 100)
    active = core["active_customers_90d"] or 1
    return {
        "repeat_customer_pct": core["repeat_customer_pct"],
        "revenue_growth_pct": core["revenue_growth_pct"] or 0.0,
        "autopay_revenue_pct": round(recurring_share, 1),
        "new_customer_pct": round(core["new_customers_30d"] / active * 100, 1),
        "lapsed_regulars_pct": round(core["lapsed_regulars"] / (active + core["lapsed_regulars"]) * 100, 1),
    }


BENCHMARK_META = {
    # key: (label, higher_is_better, recommendation-if-behind)
    "repeat_customer_pct": ("Repeat customers", True,
                            "Start a simple loyalty stamp: every 5th visit gets 10% cashback via Paytm."),
    "revenue_growth_pct": ("30-day revenue growth", True,
                           "Run a limited-time weekday offer to pull demand into your quiet hours."),
    "autopay_revenue_pct": ("Revenue on Autopay", True,
                            "Launch a monthly plan (membership / khata / fee) on UPI Autopay — predictable cash flow, and exempt from the new MDR."),
    "new_customer_pct": ("New customers (30d)", True,
                         "Put your Paytm QR on a 'first visit' offer — new customers are the top of your funnel."),
    "lapsed_regulars_pct": ("Regulars lapsed 45d+", False,
                            "Send a win-back cashback to regulars who have stopped visiting."),
}


@register_agent
class GrowthOpportunityAgent(AgentModule):
    id = "growth"
    name = "Growth Opportunity Agent"
    description = "Finds customers about to leave, under-used hours and gaps versus merchants like you."
    tier = "pro"

    def analyze(self, ctx: MerchantContext) -> list[Signal]:
        return [s for s in (self._churn(ctx), self._peak_hours(ctx), self._benchmark(ctx)) if s is not None]

    # --- churn -----------------------------------------------------------------------

    def _churn(self, ctx: MerchantContext) -> Signal | None:
        model = get_model()
        scored = model.score(ctx.tx, ctx.as_of)
        at_risk = scored[
            (scored["risk"] >= RISK_THRESHOLD)
            & (scored["recency_days"] >= MIN_DAYS_AWAY)
            & (scored["recency_days"] <= MAX_DAYS_AWAY)
        ].copy()
        if at_risk.empty:
            return None
        at_risk["priority"] = at_risk["risk"] * at_risk["monthly_value"]
        at_risk = at_risk.sort_values("priority", ascending=False)
        n = len(at_risk)
        monthly_at_stake = float(at_risk["monthly_value"].sum())
        typical_ticket = float(at_risk["avg_ticket"].median())
        cashback_cap = int(max(20, min(150, round(typical_ticket * 0.1 / 10) * 10)))
        # Assumed win-back response 15–30% (typical for targeted cashback offers).
        recover_low, recover_high = monthly_at_stake * 0.15, monthly_at_stake * 0.30
        offer_cost_high = n * 0.30 * cashback_cap
        message = (
            f"Namaste from {ctx.merchant['name']}! 🙏 We've missed you. Here's 10% cashback (up to ₹{cashback_cap}) "
            f"on your next visit when you pay with Paytm — valid for 14 days. See you soon!"
        )
        ranked = [
            {
                "customer": customer_label(cid),
                "risk_score": round(float(r.risk), 3),
                "days_since_last_visit": int(r.recency_days),
                "usual_gap_days": round(float(r.avg_gap_days), 1),
                "visits": int(r.frequency),
                "monthly_value": round(float(r.monthly_value), 2),
            }
            for cid, r in at_risk.head(40).iterrows()
        ]
        return Signal(
            id="growth-churn", agent_id=self.id, category="growth",
            severity="high" if monthly_at_stake > 10000 else "medium",
            title=f"{n} regulars haven't returned in {MIN_DAYS_AWAY}+ days — win them back",
            what_changed=f"Munshi's churn model flagged {n} customers whose visits have stopped well past their usual rhythm.",
            how_it_affects_you=(
                f"Together they used to spend about {inr(monthly_at_stake)}/month with you. If 15–30% respond to an offer, "
                f"that's {inr(recover_low)}–{inr(recover_high)}/month back."
            ),
            what_to_do=f"Send them a 10% cashback offer (capped at ₹{cashback_cap}) on WhatsApp.",
            metrics=[
                {"label": "At-risk regulars", "value": str(n), "hint": f"risk ≥ {RISK_THRESHOLD:.0%}, away {MIN_DAYS_AWAY}+ days"},
                {"label": "Monthly spend at stake", "value": inr(monthly_at_stake), "hint": "their usual monthly spend"},
                {"label": "Likely recovery", "value": f"{inr(recover_low)}–{inr(recover_high)}", "hint": "per month, 15–30% response"},
                {"label": "Max offer cost", "value": inr(offer_cost_high), "hint": "if 30% redeem"},
            ],
            recommendations=[Recommendation(
                id="winback-cashback",
                title=f"Send a 10% cashback win-back offer to {n} customers",
                description=(
                    f"Ranked by churn risk × how much they used to spend. Offer is capped at ₹{cashback_cap} per customer, "
                    f"so the worst-case cost is about {inr(offer_cost_high)}."
                ),
                impact_label=f"{inr(recover_low)}–{inr(recover_high)}/mo",
                action=ActionSpec(
                    type="message", label="Approve & Send", execution_mode="approval", channel="WhatsApp (simulated)",
                    recipients=[customer_label(c) for c in at_risk.index], preview=message,
                ),
            )],
            details={"at_risk_customers": ranked, "model": model.metrics, "assumption": "15–30% offer response rate",
                     "cashback_cap": cashback_cap},
        )

    # --- peak hours ------------------------------------------------------------------

    def _peak_hours(self, ctx: MerchantContext) -> Signal | None:
        hourly = ctx.core["hourly"]
        counts = np.array([h["avg_transactions"] for h in hourly])
        if counts.max() <= 0:
            return None
        open_hours = [h for h in range(24) if counts[h] >= counts.max() * 0.05]
        pairs = [(h, counts[h] + counts[h + 1]) for h in open_hours if h + 1 in open_hours]
        if not pairs:
            return None
        peak_h, peak_v = max(pairs, key=lambda p: p[1])
        quiet_h, quiet_v = min(pairs, key=lambda p: p[1])
        ratio = peak_v / quiet_v if quiet_v else float("inf")
        peak_lbl = f"{_hour_label(peak_h)}–{_hour_label(peak_h + 2)}"
        quiet_lbl = f"{_hour_label(quiet_h)}–{_hour_label(quiet_h + 2)}"
        avg_ticket = ctx.core["median_ticket_90d"]
        fill_gain = (peak_v - quiet_v) * 0.2 * avg_ticket * 30   # if the quiet slot gained 20% of the gap
        return Signal(
            id="growth-peak-hours", agent_id=self.id, category="growth", severity="medium",
            title=f"Your {peak_lbl} rush is {ratio:.1f}x your {quiet_lbl} lull",
            what_changed=f"Over the last 90 days your busiest 2-hour window is {peak_lbl}; {quiet_lbl} is the quietest while you're open.",
            how_it_affects_you=(
                f"You average {peak_v:.1f} payments in {peak_lbl} vs {quiet_v:.1f} in {quiet_lbl}. "
                f"Queues at peak lose walk-outs; idle staff at the lull cost money."
            ),
            what_to_do=f"Staff up and pre-stock before {_hour_label(peak_h)}; use a small {quiet_lbl} offer to move demand.",
            metrics=[
                {"label": "Peak window", "value": peak_lbl, "hint": f"{peak_v:.1f} payments/day"},
                {"label": "Quiet window", "value": quiet_lbl, "hint": f"{quiet_v:.1f} payments/day"},
                {"label": "Peak vs quiet", "value": f"{ratio:.1f}x", "hint": "payment volume"},
                {"label": "Upside if lull fills 20%", "value": inr(fill_gain), "hint": "per month, at your median ticket"},
            ],
            recommendations=[
                Recommendation(
                    id="peak-staffing",
                    title=f"Add an extra hand and restock before {_hour_label(peak_h)}",
                    description=f"Schedule one more person (or pre-pack fast movers) for {peak_lbl}, your {ratio:.1f}x rush.",
                    impact_label="Fewer walk-outs",
                    action=ActionSpec(
                        type="setting", label="Add to daily plan", execution_mode="auto",
                        preview=f"Adds a daily {_hour_label(max(peak_h - 1, 0))} reminder: 'Rush at {peak_lbl} — extra staff at counter, restock top items.'",
                        params={"reminder_hour": max(peak_h - 1, 0)},
                    ),
                ),
                Recommendation(
                    id="quiet-hour-offer",
                    title=f"Run a '{quiet_lbl} happy hour' for your regulars",
                    description=(
                        f"A 5% Paytm cashback only during {quiet_lbl} nudges flexible customers out of the rush. "
                        f"If the lull picks up 20% of the gap, that's about {inr(fill_gain)}/month."
                    ),
                    impact_label=f"~{inr(fill_gain)}/mo",
                    action=ActionSpec(
                        type="message", label="Approve & Send", execution_mode="approval", channel="WhatsApp (simulated)",
                        recipients=[f"{ctx.core['active_customers_90d']} active customers"],
                        preview=(f"Beat the rush at {ctx.merchant['name']}! ⏰ Visit between {quiet_lbl} this week and get "
                                 f"5% cashback when you pay with Paytm."),
                    ),
                ),
            ],
            details={"hourly": hourly, "peak_start": int(peak_h), "quiet_start": int(quiet_h)},
        )

    # --- benchmark -------------------------------------------------------------------

    def _benchmark(self, ctx: MerchantContext) -> Signal | None:
        peers = ctx.peer_contexts()
        if not peers:
            return None
        mine = benchmark_metrics(ctx)
        peer_vals = [benchmark_metrics(p) for p in peers]
        rows, gaps = [], []
        for key, (label, higher_better, advice) in BENCHMARK_META.items():
            peer_avg = float(np.mean([p[key] for p in peer_vals]))
            diff = mine[key] - peer_avg
            behind = diff < 0 if higher_better else diff > 0
            rows.append({"key": key, "label": label, "you": round(mine[key], 1), "peer_avg": round(peer_avg, 1),
                         "difference": round(diff, 1), "ahead": not behind})
            if behind:
                gaps.append((abs(diff), key, label, advice, mine[key], peer_avg))
        strengths = [r for r in rows if r["ahead"]]
        if not gaps:
            return Signal(
                id="growth-benchmark", agent_id=self.id, category="growth", severity="info",
                title="You're ahead of merchants like you on every Munshi benchmark",
                what_changed="Compared against other merchants on Munshi.",
                how_it_affects_you="No gaps found this month.", what_to_do="Keep going.",
                details={"benchmarks": rows, "peer_count": len(peers)},
            )
        gaps.sort(reverse=True)
        _, key, label, advice, you, avg = gaps[0]
        best = max(strengths, key=lambda r: abs(r["difference"])) if strengths else None
        strength_txt = f" You lead on {best['label'].lower()} ({best['you']}% vs {best['peer_avg']}%)." if best else ""
        return Signal(
            id="growth-benchmark", agent_id=self.id, category="growth", severity="low",
            title=f"Merchants like you: biggest gap is {label.lower()} ({you:.0f}% vs {avg:.0f}%)",
            what_changed=f"Munshi compared your last 90 days with {len(peers)} other merchants on the platform.",
            how_it_affects_you=f"Your {label.lower()} is {you:.1f}% against a peer average of {avg:.1f}%.{strength_txt}",
            what_to_do=advice,
            metrics=[{"label": r["label"], "value": f"{r['you']}%", "hint": f"peers {r['peer_avg']}%"} for r in rows[:4]],
            recommendations=[Recommendation(
                id=f"benchmark-{key}",
                title=advice.split(" — ")[0].rstrip("."),
                description=advice,
                impact_label=f"Close a {abs(you - avg):.0f}-pt gap",
                action=ActionSpec(
                    type="setting", label="Approve & set up", execution_mode="approval",
                    preview=f"Munshi sets this up as a draft for you to review: '{advice}'",
                    params={"benchmark": key},
                ),
            )],
            details={"benchmarks": rows, "peer_count": len(peers),
                     "note": "Peer set = other merchants on this Munshi instance (seeded demo data)."},
        )

    def chat_context(self, signals: list[Signal]) -> dict[str, Any]:
        return {s.id: {"title": s.title, "impact": s.how_it_affects_you, "action": s.what_to_do} for s in signals}
