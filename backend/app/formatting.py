"""Indian-style number formatting helpers."""
from __future__ import annotations


def indian_group(n: int) -> str:
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return ("-" if n < 0 else "") + s


def inr(value: float, symbol: str = "₹") -> str:
    """₹1,23,456 — whole rupees for amounts ≥ 100, paise below that."""
    value = float(value or 0)
    if abs(value) < 100 and value != int(value):
        return f"{symbol}{value:,.2f}"
    return f"{symbol}{indian_group(int(round(value)))}"


def customer_label(customer_id: str) -> str:
    """Privacy-friendly label for a customer id, e.g. 'M003-S0042' -> 'Customer •••S0042'."""
    return f"Customer •••{customer_id.split('-')[-1]}"
