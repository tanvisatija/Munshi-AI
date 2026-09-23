"""Business-health statistics computed from a merchant's transactions."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

LARGE_TICKET_THRESHOLD = 2000.0


def as_of_date(tx: pd.DataFrame) -> pd.Timestamp:
    """'Today' for the analysis = the day after the latest transaction."""
    if tx.empty:
        return pd.Timestamp.today().normalize()
    return tx["timestamp"].max().normalize() + pd.Timedelta(days=1)


def window(tx: pd.DataFrame, as_of: pd.Timestamp, days: int, offset_days: int = 0) -> pd.DataFrame:
    end = as_of - pd.Timedelta(days=offset_days)
    start = end - pd.Timedelta(days=days)
    return tx[(tx["timestamp"] >= start) & (tx["timestamp"] < end)]


def pct_change(new: float, old: float) -> float | None:
    if not old:
        return None
    return round((new - old) / old * 100, 1)


def volume_breakdown(tx: pd.DataFrame, threshold: float = LARGE_TICKET_THRESHOLD) -> list[dict[str, Any]]:
    recurring = tx["is_recurring"]
    small = (~recurring) & (tx["amount"] <= threshold)
    large = (~recurring) & (tx["amount"] > threshold)
    buckets = [
        ("small", f"≤ ₹{threshold:,.0f}", small),
        ("large_one_off", f"> ₹{threshold:,.0f} one-off", large),
        ("recurring", "Recurring / Autopay (exempt)", recurring),
    ]
    total_value = float(tx["amount"].sum()) or 1.0
    total_count = len(tx) or 1
    return [
        {
            "key": key,
            "label": label,
            "count": int(mask.sum()),
            "value": round(float(tx.loc[mask, "amount"].sum()), 2),
            "count_pct": round(mask.sum() / total_count * 100, 1),
            "value_pct": round(float(tx.loc[mask, "amount"].sum()) / total_value * 100, 1),
        }
        for key, label, mask in buckets
    ]


def weekly_revenue(tx: pd.DataFrame, as_of: pd.Timestamp, weeks: int = 26) -> list[dict[str, Any]]:
    out = []
    for i in range(weeks - 1, -1, -1):
        w = window(tx, as_of, 7, offset_days=7 * i)
        week_end = as_of - pd.Timedelta(days=7 * i + 1)
        out.append(
            {
                "week_ending": week_end.strftime("%Y-%m-%d"),
                "label": week_end.strftime("%d %b"),
                "revenue": round(float(w["amount"].sum()), 2),
                "transactions": int(len(w)),
            }
        )
    return out


def hourly_profile(tx: pd.DataFrame, as_of: pd.Timestamp, days: int = 90) -> list[dict[str, Any]]:
    w = window(tx[~tx["is_recurring"]], as_of, days)  # autopay debits aren't footfall
    by_hour = w.groupby(w["timestamp"].dt.hour).agg(count=("amount", "size"), value=("amount", "sum"))
    return [
        {
            "hour": h,
            "label": f"{(h % 12) or 12}{'am' if h < 12 else 'pm'}",
            "avg_transactions": round(float(by_hour["count"].get(h, 0)) / days, 2),
            "avg_value": round(float(by_hour["value"].get(h, 0)) / days, 2),
        }
        for h in range(24)
    ]


def repeat_customer_pct(tx: pd.DataFrame, as_of: pd.Timestamp, days: int = 90) -> float:
    w = window(tx, as_of, days)
    counts = w.groupby("customer_id").size()
    if counts.empty:
        return 0.0
    return round(float((counts >= 2).mean() * 100), 1)


def core_stats(tx: pd.DataFrame, as_of: pd.Timestamp) -> dict[str, Any]:
    last30, prev30 = window(tx, as_of, 30), window(tx, as_of, 30, offset_days=30)
    last90 = window(tx, as_of, 90)
    rev30, rev_prev = float(last30["amount"].sum()), float(prev30["amount"].sum())

    first_seen = tx.groupby("customer_id")["timestamp"].min()
    last_seen = tx.groupby("customer_id")["timestamp"].max()
    active_90 = int((last_seen >= as_of - pd.Timedelta(days=90)).sum())
    lapsed = int(((last_seen < as_of - pd.Timedelta(days=45)) & (tx.groupby("customer_id").size() >= 2)).sum())
    new_30 = int((first_seen >= as_of - pd.Timedelta(days=30)).sum())

    return {
        "as_of": as_of.strftime("%Y-%m-%d"),
        "period_start": tx["timestamp"].min().strftime("%Y-%m-%d") if not tx.empty else None,
        "revenue_30d": round(rev30, 2),
        "revenue_prev_30d": round(rev_prev, 2),
        "revenue_growth_pct": pct_change(rev30, rev_prev),
        "revenue_180d": round(float(tx["amount"].sum()), 2),
        "transactions_30d": int(len(last30)),
        "transactions_per_day": round(len(last30) / 30, 1),
        "avg_ticket_90d": round(float(last90["amount"].mean()), 2) if not last90.empty else 0.0,
        "median_ticket_90d": round(float(last90["amount"].median()), 2) if not last90.empty else 0.0,
        "repeat_customer_pct": repeat_customer_pct(tx, as_of),
        "active_customers_90d": active_90,
        "new_customers_30d": new_30,
        "lapsed_regulars": lapsed,
        "monthly_upi_qr_receipts": round(float(window(tx[tx["channel"] == "upi_qr"], as_of, 90)["amount"].sum()) / 3, 2),
        "volume_breakdown": volume_breakdown(last90),
        "weekly_revenue": weekly_revenue(tx, as_of),
        "hourly": hourly_profile(tx, as_of),
    }


def health_score(core: dict[str, Any]) -> dict[str, Any]:
    """0-100 composite. Each component is explainable to a merchant in one line."""
    growth = core["revenue_growth_pct"] or 0.0
    momentum = float(np.clip(12.5 + growth * 1.25, 0, 25))              # flat = 12.5, +10% = 25
    loyalty = float(np.clip(core["repeat_customer_pct"] / 80 * 25, 0, 25))  # 80% repeat = full marks
    active = core["active_customers_90d"]
    retention_ratio = active / (active + core["lapsed_regulars"]) if active else 0.0
    retention = float(np.clip((retention_ratio - 0.5) / 0.45 * 25, 0, 25))  # 95% retained = full marks
    large = next(b for b in core["volume_breakdown"] if b["key"] == "large_one_off")
    exposure = float(np.clip(25 - large["value_pct"] * 0.5, 0, 25))         # less fee-exposed revenue = better
    components = [
        {"key": "momentum", "label": "Sales momentum", "score": round(momentum, 1), "max": 25,
         "hint": f"Last 30 days vs previous 30: {growth:+.1f}%"},
        {"key": "loyalty", "label": "Customer loyalty", "score": round(loyalty, 1), "max": 25,
         "hint": f"{core['repeat_customer_pct']:.0f}% of recent customers came back"},
        {"key": "retention", "label": "Retention", "score": round(retention, 1), "max": 25,
         "hint": f"{core['lapsed_regulars']} regulars haven't returned in 45+ days"},
        {"key": "fee_resilience", "label": "Fee resilience", "score": round(exposure, 1), "max": 25,
         "hint": f"{large['value_pct']:.0f}% of revenue is one-off tickets above ₹2,000"},
    ]
    total = round(sum(c["score"] for c in components))
    band = "Strong" if total >= 75 else "Healthy" if total >= 60 else "Needs attention"
    return {"score": total, "band": band, "components": components}
