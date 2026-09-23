"""Regulatory Impact Agent — flagship module.

Models the UPI P2M MDR rule precisely and applies it to the merchant's *own* history.

DELIBERATE EXCLUSION: this module contains no transaction-splitting, amount-structuring
or any other fee-avoidance logic, and must never suggest breaking a payment into
sub-₹2,000 pieces. Every recommendation here is a compliant lever: recover GST via ITC,
move genuinely recurring payers onto UPI Autopay (explicitly exempt by the rule),
offer a different payment instrument for big tickets, or make an informed pricing call.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any

import pandas as pd

from ..engine.base import ActionSpec, AgentModule, Recommendation, Signal
from ..engine.context import MerchantContext
from ..engine.registry import register_agent
from ..engine.stats import window
from ..formatting import customer_label, inr

UPI_P2M_CHANNELS = {"upi_qr", "upi_intent", "upi_collect", "upi_autopay"}
# Below this share of gross profit, repricing isn't worth the customer friction.
ABSORB_BELOW_PCT_OF_PROFIT = 0.5


@dataclass
class RuleSpec:
    name: str = "UPI P2M MDR on transactions above ₹2,000"
    threshold: float = 2000.0                 # applies to amounts strictly above this
    rate_pct: float = 0.4
    cap: float | None = 300.0                 # per-transaction MDR cap (₹)
    gst_pct: float = 18.0                     # GST on the MDR fee itself, recoverable as ITC
    effective_date: str = "2026-10-15"
    exempt_recurring: bool = True             # UPI Autopay / mandates exempt at any amount
    small_merchant_monthly_limit: float | None = 100000.0  # ≤ this via UPI QR per month -> exempt
    source: str = "built-in"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RuleSpec":
        base = asdict(cls())
        base.update({k: v for k, v in data.items() if k in base and v is not None})
        return cls(**base)


DEFAULT_RULE = RuleSpec()


def fee_frame(tx: pd.DataFrame, rule: RuleSpec) -> pd.DataFrame:
    """Per-transaction fee under the rule. Pure function of the data + rule."""
    df = tx.copy()
    affected = (df["amount"] > rule.threshold) & df["channel"].isin(UPI_P2M_CHANNELS)
    if rule.exempt_recurring:
        affected &= ~df["is_recurring"]
    mdr = df["amount"] * rule.rate_pct / 100
    if rule.cap is not None:
        mdr = mdr.clip(upper=rule.cap)
    df["affected"] = affected
    df["mdr"] = mdr.where(affected, 0.0).round(2)
    df["gst"] = (df["mdr"] * rule.gst_pct / 100).round(2)
    df["cap_hit"] = affected & (rule.cap is not None) & (df["amount"] * rule.rate_pct / 100 >= (rule.cap or 0))
    return df


def _sum(df: pd.DataFrame, col: str) -> float:
    return round(float(df[col].sum()), 2)


def compute_impact(tx: pd.DataFrame, as_of: pd.Timestamp, rule: RuleSpec = DEFAULT_RULE) -> dict[str, Any]:
    fees = fee_frame(tx, rule)
    monthly_qr = float(window(tx[tx["channel"] == "upi_qr"], as_of, 90)["amount"].sum()) / 3
    small_exempt = rule.small_merchant_monthly_limit is not None and monthly_qr <= rule.small_merchant_monthly_limit
    if small_exempt:
        fees[["mdr", "gst"]] = 0.0
        fees["affected"] = False

    last90 = window(fees, as_of, 90)
    hit = last90[last90["affected"]]
    mdr, gst = _sum(hit, "mdr"), _sum(hit, "gst")

    # Six consecutive 30-day windows -> monthly cost history.
    monthly = []
    for i in range(5, -1, -1):
        w = window(fees, as_of, 30, offset_days=30 * i)
        end = as_of - pd.Timedelta(days=30 * i + 1)
        monthly.append({
            "label": end.strftime("%d %b"),
            "mdr": _sum(w, "mdr"),
            "gst": _sum(w, "gst"),
            "affected_count": int(w["affected"].sum()),
        })
    net_months = [m["mdr"] for m in monthly]
    gross_months = [m["mdr"] + m["gst"] for m in monthly]

    effective = datetime.strptime(rule.effective_date, "%Y-%m-%d").date() if rule.effective_date else None
    as_of_d: date = as_of.date()
    in_effect = bool(effective and as_of_d >= effective)

    recurring = last90["is_recurring"]
    small = (~recurring) & (last90["amount"] <= rule.threshold)
    large = (~recurring) & (last90["amount"] > rule.threshold)
    breakdown = []
    for key, label, mask, note in [
        ("small", f"≤ ₹{rule.threshold:,.0f}", small, "Unaffected"),
        ("large_one_off", f"> ₹{rule.threshold:,.0f}, one-off", large, "MDR + GST applies" if not small_exempt else "Exempt (small merchant)"),
        ("recurring", "Recurring / UPI Autopay", recurring, "Exempt at any amount"),
    ]:
        breakdown.append({
            "key": key, "label": label, "note": note,
            "count": int(mask.sum()),
            "value": _sum(last90[mask], "amount"),
            "fee": round(_sum(last90[mask], "mdr") + _sum(last90[mask], "gst"), 2),
        })

    total_rev = _sum(last90, "amount")
    return {
        "rule": asdict(rule),
        "as_of": as_of_d.isoformat(),
        "in_effect": in_effect,
        # True only when every day of the 90-day window was under the rule -> "this already cost you".
        "window_fully_in_effect": bool(effective and (as_of_d - pd.Timedelta(days=90).to_pytimedelta()) >= effective),
        "days_until_effective": (effective - as_of_d).days if effective and not in_effect else 0,
        "small_merchant_exempt": small_exempt,
        "monthly_upi_qr_receipts": round(monthly_qr, 2),
        "retrospective": {
            "window_days": 90,
            "total_transactions": int(len(last90)),
            "total_revenue": total_rev,
            "affected_transactions": int(len(hit)),
            "affected_value": _sum(hit, "amount"),
            "mdr": mdr,
            "gst": gst,
            "gross_cost": round(mdr + gst, 2),
            "net_cost_after_itc": mdr,
            "itc_recoverable": gst,
            "cost_pct_of_revenue": round((mdr / total_rev * 100) if total_rev else 0.0, 3),
            "cap_hits": int(hit["cap_hit"].sum()),
        },
        "forward_estimate": {
            "horizon_days": 90,
            "net_low": round(min(net_months) * 3, 2),
            "net_high": round(max(net_months) * 3, 2),
            "gross_low": round(min(gross_months) * 3, 2),
            "gross_high": round(max(gross_months) * 3, 2),
            "assumption": "Assumes your next 3 months look like your last 6: the low end repeats your quietest "
                          "30-day stretch every month, the high end your busiest. Festive-season spikes may push above the range.",
        },
        "monthly": monthly,
        "breakdown": breakdown,
    }


def _merchant_url(ctx: MerchantContext, path: str) -> str:
    return f"/api/merchants/{ctx.merchant_id}/{path}"


@register_agent
class RegulatoryImpactAgent(AgentModule):
    id = "regulatory"
    name = "Regulatory Impact Agent"
    description = "Turns new payment rules into your exact rupee impact, plus compliant ways to respond."
    tier = "free"   # the alert + impact is always free; its actions are Pro (enforced in actions service)

    def analyze(self, ctx: MerchantContext) -> list[Signal]:
        rule = DEFAULT_RULE
        impact = compute_impact(ctx.tx, ctx.as_of, rule)
        retro, fwd = impact["retrospective"], impact["forward_estimate"]

        what_changed = (
            f"From {datetime.strptime(rule.effective_date, '%Y-%m-%d'):%d %b %Y}, person-to-merchant UPI payments above "
            f"₹{rule.threshold:,.0f} carry a {rule.rate_pct}% MDR (capped at ₹{rule.cap:,.0f} per transaction), plus "
            f"{rule.gst_pct:.0f}% GST on that fee. Payments of ₹2,000 or less, UPI Autopay mandates and small merchants "
            f"(≤ ₹1 lakh/month via UPI QR) are exempt. Customers pay nothing extra — the merchant absorbs it."
        )

        if impact["small_merchant_exempt"]:
            return [Signal(
                id="reg-upi-mdr", agent_id=self.id, category="risk", severity="info", hero=True,
                title="New UPI MDR rule: you're exempt (for now)",
                what_changed=what_changed,
                how_it_affects_you=f"Your UPI QR receipts average {inr(impact['monthly_upi_qr_receipts'])}/month — under the ₹1 lakh small-merchant limit, so none of your payments are charged.",
                what_to_do="No action needed. Munshi will alert you if your QR receipts approach ₹1 lakh/month.",
                details={"impact": impact},
            )]

        lead = "That already cost you" if impact["window_fully_in_effect"] else "Had the rule applied, that would have cost you"
        how = (
            f"Applied to your actual last 90 days, {retro['affected_transactions']} of your "
            f"{retro['total_transactions']:,} payments ({inr(retro['affected_value'])}) fall under the rule. "
            f"{lead} exactly {inr(retro['gross_cost'])} — {inr(retro['mdr'])} MDR + {inr(retro['gst'])} GST. "
            f"The GST part is recoverable as Input Tax Credit, so your real cost is {inr(retro['net_cost_after_itc'])}. "
            f"Next 3 months: {inr(fwd['net_low'])}–{inr(fwd['net_high'])} after ITC."
        )

        recs = [
            self._itc(ctx, impact),
            self._autopay(ctx, rule),
            self._bnpl(ctx, rule),
            self._pricing(ctx, impact),
        ]
        recs = [r for r in recs if r is not None]
        severity = "high" if retro["net_cost_after_itc"] >= 1000 else "medium"
        countdown = f" ({impact['days_until_effective']} days away)" if impact["days_until_effective"] else ""
        return [Signal(
            id="reg-upi-mdr", agent_id=self.id, category="risk", severity=severity, hero=True,
            title=f"New UPI MDR from 15 Oct{countdown}: ~{inr(fwd['net_low'])}–{inr(fwd['net_high'])} per quarter for you",
            what_changed=what_changed,
            how_it_affects_you=how,
            what_to_do=" ".join(f"({i}) {r.title}." for i, r in enumerate(recs, 1)),
            metrics=[
                {"label": "Last 90 days (exact)", "value": inr(retro["gross_cost"]), "hint": "MDR + GST on your actual payments"},
                {"label": "Recoverable via ITC", "value": inr(retro["itc_recoverable"]), "hint": "18% GST on the fee"},
                {"label": "Next quarter (range)", "value": f"{inr(fwd['net_low'])}–{inr(fwd['net_high'])}", "hint": "after ITC"},
                {"label": "Payments affected", "value": f"{retro['affected_transactions']}", "hint": f"of {retro['total_transactions']:,} in 90 days"},
            ],
            recommendations=recs,
            details={"impact": impact},
        )]

    # --- recommendations -------------------------------------------------------------

    def _itc(self, ctx: MerchantContext, impact: dict[str, Any]) -> Recommendation:
        retro, fwd = impact["retrospective"], impact["forward_estimate"]
        gst_low, gst_high = fwd["gross_low"] - fwd["net_low"], fwd["gross_high"] - fwd["net_high"]
        return Recommendation(
            id="itc-summary",
            title="Recover the GST on every MDR fee via Input Tax Credit",
            description=(
                f"The 18% GST charged on MDR is claimable as ITC in your GST return. On your last 90 days that is "
                f"{inr(retro['itc_recoverable'])}; next quarter {inr(gst_low)}–{inr(gst_high)}. Munshi prepares a "
                f"transaction-level summary you (or your CA) can reconcile against the MDR tax invoices."
            ),
            impact_label=f"{inr(retro['itc_recoverable'])} recoverable",
            action=ActionSpec(
                type="document", label="Generate ITC summary", execution_mode="auto",
                preview="CSV + PDF: every affected transaction with its MDR and GST, month-wise totals, reconciliation notes.",
                downloads=[
                    {"label": "ITC summary (CSV)", "url": _merchant_url(ctx, "documents/itc.csv")},
                    {"label": "ITC summary (PDF)", "url": _merchant_url(ctx, "documents/itc.pdf")},
                ],
            ),
            notes=["Working summary for reconciliation — claim only against the tax invoice issued by your payment provider."],
        )

    def _autopay(self, ctx: MerchantContext, rule: RuleSpec) -> Recommendation | None:
        fees = window(fee_frame(ctx.tx, rule), ctx.as_of, 180)
        large = fees[fees["affected"]].copy()
        if large.empty:
            return None
        large["month"] = large["timestamp"].dt.to_period("M")
        per_cust = large.groupby("customer_id").agg(
            months=("month", "nunique"), payments=("amount", "size"), avg_amount=("amount", "mean"), mdr=("mdr", "sum"),
            gst=("gst", "sum"),
        )
        repeaters = per_cust[per_cust["months"] >= 3].sort_values("mdr", ascending=False)
        if repeaters.empty:
            return None
        per_month = (repeaters["mdr"] / 6)              # 180-day window ≈ 6 months
        annual_saving = round(float(per_month.sum() * 12), 2)
        recipients = [customer_label(c) for c in repeaters.index]
        message = (
            f"Namaste! 🙏 You pay {ctx.merchant['name']} regularly — switch to UPI Autopay and never worry about the "
            f"due date again. One-time setup in your UPI app, cancel anytime, same amount as always. "
            f"Tap to set up: paytm.me/autopay/{ctx.merchant_id.lower()}"
        )
        return Recommendation(
            id="autopay-conversion",
            title=f"Move {len(repeaters)} repeat big-ticket customers to UPI Autopay",
            description=(
                f"{len(repeaters)} customers paid you more than ₹{rule.threshold:,.0f} in 3+ separate months "
                f"(avg {inr(float(repeaters['avg_amount'].mean()))}). Autopay mandates are exempt from the new MDR, so "
                f"converting them saves about {inr(annual_saving)}/year — and makes collections predictable."
            ),
            impact_label=f"{inr(annual_saving)}/yr saved",
            action=ActionSpec(
                type="message", label="Approve & Send", execution_mode="approval", channel="WhatsApp (simulated)",
                recipients=recipients, preview=message,
            ),
            data={"customers": [
                {"customer": customer_label(c), "months_paid": int(r.months), "avg_amount": round(float(r.avg_amount), 2),
                 "mdr_6m": round(float(r.mdr), 2)}
                for c, r in repeaters.head(100).iterrows()
            ]},
        )

    def _bnpl(self, ctx: MerchantContext, rule: RuleSpec) -> Recommendation | None:
        fees = window(fee_frame(ctx.tx, rule), ctx.as_of, 180)
        large = fees[fees["affected"]]
        counts = large.groupby("customer_id").size()
        one_off_ids = counts[counts <= 1].index
        recent = window(large[large["customer_id"].isin(one_off_ids)], ctx.as_of, 90)
        if recent.empty:
            return None
        return Recommendation(
            id="postpaid-bnpl",
            title="Offer Paytm Postpaid / 'pay in parts' on big one-off tickets",
            description=(
                f"In the last 90 days, {len(recent)} first-time or one-off customers paid above ₹{rule.threshold:,.0f} "
                f"(avg {inr(float(recent['amount'].mean()))}, total {inr(float(recent['amount'].sum()))}). Showing a "
                f"'pay later / split in 3' option at checkout helps close these big tickets and lifts basket size."
            ),
            impact_label=f"{len(recent)} big tickets/quarter",
            action=ActionSpec(
                type="setting", label="Approve & enable", execution_mode="approval",
                preview="Adds a 'Pay later with Postpaid / split in 3' prompt on your QR standee and payment link for bills above ₹2,000.",
                params={"setting": "show_postpaid_prompt_above", "value": rule.threshold},
            ),
            notes=["Postpaid/BNPL has its own merchant pricing — compare it against UPI MDR before switching volume. "
                   "This is a conversion lever, not a way around the UPI fee."],
        )

    def _pricing(self, ctx: MerchantContext, impact: dict[str, Any]) -> Recommendation:
        retro = impact["retrospective"]
        margin = float(ctx.merchant["gross_margin_pct"]) / 100
        net_cost = retro["net_cost_after_itc"]
        affected_rev = retro["affected_value"] or 1.0
        profit_affected = affected_rev * margin
        profit_total = retro["total_revenue"] * margin or 1.0
        pct_of_profit_affected = net_cost / profit_affected * 100 if profit_affected else 0.0
        pct_of_profit_total = net_cost / profit_total * 100
        # Smallest list-price rise on >₹2,000 items that fully offsets the fee, rounded up to 0.1%.
        breakeven_pct = max(0.1, math.ceil(net_cost / affected_rev * 1000) / 10)
        typical = float(window(ctx.tx, ctx.as_of, 90).query("amount > 2000")["amount"].median() or 0)
        absorb = pct_of_profit_total < ABSORB_BELOW_PCT_OF_PROFIT
        option = "absorb" if absorb else "reprice"
        if absorb:
            title = f"Pricing advisor: absorb the fee — it's only {pct_of_profit_total:.2f}% of your gross profit"
            desc = (
                f"At your {margin * 100:.0f}% gross margin, the net fee ({inr(net_cost)}/quarter) is "
                f"{pct_of_profit_total:.2f}% of your gross profit. A price change isn't worth the customer friction. "
                f"If you'd still like to offset it, a {breakeven_pct:.1f}% rise on items above ₹2,000 does it "
                f"(≈{inr(typical * breakeven_pct / 100)} on a typical {inr(typical)} bill)."
            )
        else:
            title = f"Pricing advisor: a {breakeven_pct:.1f}% list-price rise on big tickets offsets the fee"
            desc = (
                f"At your {margin * 100:.0f}% gross margin the net fee eats {pct_of_profit_affected:.1f}% of the profit on "
                f"your above-₹2,000 sales. Raising those list prices by {breakeven_pct:.1f}% (≈{inr(typical * breakeven_pct / 100)} "
                f"on a typical {inr(typical)} bill) recovers it fully."
            )
        return Recommendation(
            id="pricing-advisor",
            title=title,
            description=desc,
            impact_label=f"{pct_of_profit_total:.2f}% of gross profit",
            action=ActionSpec(
                type="pricing", execution_mode="approval",
                label="Keep current prices" if absorb else f"Review {breakeven_pct:.1f}% price change",
                preview=(
                    f"Keep your list prices unchanged and absorb the fee (about {inr(net_cost)}/quarter after ITC). "
                    "Munshi records the decision; nothing changes for your customers."
                    if absorb else
                    f"Raise list prices by {breakeven_pct:.1f}% on items/services above ₹2,000, for every payment method. "
                    "Munshi never changes prices itself — after you confirm, update your price list at the counter."
                ),
                params={"option": option, "price_change_pct": 0 if absorb else breakeven_pct, "applies_above": 2000},
            ),
            notes=["Munshi does not recommend a separate surcharge for paying by UPI — under this rule customers pay nothing "
                   "extra, so any adjustment belongs in your normal list price, applied to every payment method."],
            data={
                "gross_margin_pct": margin * 100,
                "net_fee_quarter": net_cost,
                "pct_of_gross_profit_total": round(pct_of_profit_total, 3),
                "pct_of_gross_profit_on_affected": round(pct_of_profit_affected, 3),
                "breakeven_price_change_pct": breakeven_pct,
                "typical_large_ticket": round(typical, 2),
                "recommended_option": option,
            },
        )

    def chat_context(self, signals: list[Signal]) -> dict[str, Any]:
        if not signals:
            return {}
        impact = signals[0].details["impact"]
        return {
            "mdr_rule": {k: impact["rule"][k] for k in ("threshold", "rate_pct", "cap", "gst_pct", "effective_date")},
            "mdr_small_merchant_exempt": impact["small_merchant_exempt"],
            "mdr_last_90_days": impact["retrospective"],
            "mdr_next_quarter_range_after_itc": [impact["forward_estimate"]["net_low"], impact["forward_estimate"]["net_high"]],
            "mdr_recommendations": [r.title for r in signals[0].recommendations],
        }
