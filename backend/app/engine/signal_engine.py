"""Runs every registered agent against a merchant and assembles the alerts feed."""
from __future__ import annotations

import logging
from typing import Any

from .base import Signal
from .context import MerchantContext
from .registry import all_agents

log = logging.getLogger("munshi.engine")

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}


def run_signals(ctx: MerchantContext) -> list[Signal]:
    signals: list[Signal] = []
    for agent in all_agents():
        try:
            signals.extend(agent.analyze(ctx))
        except Exception:  # one broken agent must never take down the feed
            log.exception("Agent %s failed for merchant %s", agent.id, ctx.merchant_id)
    signals.sort(key=lambda s: (not s.hero, SEVERITY_ORDER.get(s.severity, 9)))
    return signals


def locked_view(signal: Signal) -> dict[str, Any]:
    """What a free-tier merchant sees for a Pro-only signal: the hook, not the answer."""
    return {
        "id": signal.id,
        "agent_id": signal.agent_id,
        "category": signal.category,
        "severity": signal.severity,
        "title": signal.title,
        "what_changed": signal.what_changed,
        "locked": True,
        "hero": False,
    }


def feed(ctx: MerchantContext, pro: bool) -> list[dict[str, Any]]:
    tiers = {a.id: a.tier for a in all_agents()}
    out = []
    for s in run_signals(ctx):
        if tiers.get(s.agent_id) == "pro" and not pro:
            out.append(locked_view(s))
        else:
            out.append({**s.to_dict(), "locked": False})
    return out
