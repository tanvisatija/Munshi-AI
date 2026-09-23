"""Merchant Signal Engine — core contracts.

Every agent module turns the merchant's own data into Signals with the same shape:
    what changed  ->  how it affects YOU (numbers from your transactions)  ->  what to do.

To add a new agent (e.g. a Festive-Demand agent or a Loan-Readiness agent):
  1. Subclass `AgentModule` in `app/agents/<your_agent>.py` and implement `analyze()`.
  2. Decorate the class with `@register_agent` (see `registry.py`).
  3. Import it in `app/agents/__init__.py`.
The engine, API, alerts feed, Pro gating, Approve & Send and the Actions Log all work
for the new agent with zero changes to core code.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

Category = Literal["risk", "growth"]
Severity = Literal["high", "medium", "low", "info"]
Tier = Literal["free", "pro"]
ActionType = Literal["message", "document", "pricing", "setting"]
ExecutionMode = Literal["auto", "approval"]


@dataclass
class ActionSpec:
    """What 'Approve & Send' does for a recommendation.

    execution_mode:
      auto     — low-risk, can run without a human (e.g. generating an ITC summary).
      approval — needs the merchant's explicit OK (messages to customers, settings).
    Pricing actions are ALWAYS 'approval' and additionally require a second confirm
    step — the engine enforces this in `services/actions.py`, agents cannot opt out.
    """

    type: ActionType
    label: str
    execution_mode: ExecutionMode = "approval"
    channel: str | None = None              # e.g. "WhatsApp (simulated)"
    recipients: list[str] = field(default_factory=list)
    preview: str | None = None              # message body / document description shown before sending
    downloads: list[dict[str, str]] = field(default_factory=list)  # [{label, url}]
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class Recommendation:
    id: str
    title: str
    description: str
    impact_label: str                       # short "₹X/quarter" style value tag
    action: ActionSpec
    notes: list[str] = field(default_factory=list)
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Signal:
    id: str
    agent_id: str
    category: Category
    severity: Severity
    title: str
    what_changed: str
    how_it_affects_you: str
    what_to_do: str
    metrics: list[dict[str, Any]] = field(default_factory=list)   # [{label, value, hint}]
    recommendations: list[Recommendation] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)          # agent-specific breakdown for the detail view
    hero: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class AgentModule(ABC):
    """Base class for every Munshi agent. Stateless: all state comes from the context."""

    id: str = ""
    name: str = ""
    description: str = ""
    tier: Tier = "free"          # "pro" agents are fully gated behind Munshi AI Pro

    @abstractmethod
    def analyze(self, ctx: "MerchantContext") -> list[Signal]:  # noqa: F821
        """Read the merchant context and return zero or more signals."""

    def chat_context(self, signals: list[Signal]) -> dict[str, Any]:
        """Compact facts this agent contributes to the chat grounding context."""
        return {s.title: s.how_it_affects_you for s in signals}

    def info(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "description": self.description, "tier": self.tier}
