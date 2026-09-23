"""Generate 6 months of synthetic UPI transactions for three merchant personas.

    python seed_data.py            # seed only if the DB is empty
    python seed_data.py --force    # wipe and re-seed

Each persona has deliberately different economics so the agents have something real
to find:
  * Kirana    — many small tickets, a monthly "ration" basket above Rs 2,000 for regulars,
                occasional one-off bulk/party orders, strong morning + evening peaks.
  * Salon     — mid tickets every few weeks, big one-off bridal/treatment packages,
                a few Autopay memberships, dead weekday afternoons.
  * Tuition   — monthly fees above Rs 2,000 (about half already on Autopay, half paid
                manually each month — prime Autopay-conversion candidates), small book sales.

Customers arrive and churn over time, which gives the churn model real signal.
Fully deterministic (fixed RNG seed).
"""
from __future__ import annotations

import argparse
import math
import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import settings  # noqa: E402
from app.db import get_conn, init_schema  # noqa: E402

DAYS = 183
RNG_SEED = 20261015


@dataclass
class Merchant:
    id: str
    name: str
    category: str
    persona: str
    city: str
    owner_name: str
    gross_margin_pct: float
    visibility_pct: int


MERCHANTS = [
    Merchant("M001", "Sharma General Store", "Kirana / General Store", "kirana", "Jaipur", "Ramesh Sharma", 14.0, 55),
    Merchant("M002", "Glow Unisex Salon", "Salon & Beauty", "salon", "Pune", "Priya Kulkarni", 52.0, 70),
    Merchant("M003", "Bright Future Tuition Centre", "Education / Coaching", "tuition", "Lucknow", "Anil Verma", 68.0, 80),
]

# Relative transaction weight by hour of day (0-23). Zero = closed.
HOURLY = {
    "kirana": [0, 0, 0, 0, 0, 0, 0, 3, 7, 8, 6, 4, 3, 3, 2, 2, 3, 5, 9, 11, 10, 7, 3, 0],
    "salon": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2, 1.2, 1, 1, 1.5, 3, 7, 9, 9, 7, 3, 0, 0],
    "tuition": [0, 0, 0, 0, 0, 0, 0, 2, 4, 3, 2, 1, 1, 1, 1, 3, 7, 8, 6, 4, 2, 0, 0, 0],
}


def end_date() -> date:
    if settings.seed_end_date:
        return datetime.strptime(settings.seed_end_date, "%Y-%m-%d").date()
    return date.today() - timedelta(days=1)


class Gen:
    def __init__(self, rng: random.Random, start: date, end: date):
        self.rng = rng
        self.start = start
        self.end = end
        self.rows: list[tuple] = []
        self.counter = 0

    def ts(self, day: date, persona: str) -> str:
        hour = self.rng.choices(range(24), weights=HOURLY[persona])[0]
        minute, second = self.rng.randrange(60), self.rng.randrange(60)
        return datetime(day.year, day.month, day.day, hour, minute, second).isoformat()

    def add(self, merchant_id: str, customer: str, amount: float, when: str, recurring: bool, channel: str):
        self.counter += 1
        self.rows.append(
            (f"TXN{self.counter:07d}", merchant_id, customer, round(amount, 2), when, int(recurring), channel)
        )

    def lifespan(self, join_prob_late: float, churn_prob: float) -> tuple[date, date]:
        """Customer active window: some join mid-period, some churn before the end."""
        joined = self.start
        if self.rng.random() < join_prob_late:
            joined = self.start + timedelta(days=self.rng.randrange(20, DAYS - 20))
        left = self.end
        if self.rng.random() < churn_prob:
            span = (self.end - joined).days
            if span > 40:
                left = joined + timedelta(days=self.rng.randrange(30, span - 5))
        return joined, left

    def spread(self, n: int, per_period: float = 5.5) -> date:
        """n-th one-off booking, spaced roughly evenly across the period (with jitter), so
        big tickets don't randomly cluster into one month and distort growth numbers."""
        offset = int(n * per_period + self.rng.uniform(-2, 2)) % DAYS
        return self.start + timedelta(days=offset)

    def days(self, a: date, b: date):
        d = max(a, self.start)
        while d <= min(b, self.end):
            yield d
            d += timedelta(days=1)


def gen_kirana(g: Gen, m: Merchant):
    rng = g.rng
    for n in range(1, 301):
        cid = f"{m.id}-C{n:04d}"
        joined, left = g.lifespan(0.18, 0.22)
        visits_per_week = rng.gammavariate(2.0, 0.55) + 0.25
        typical = rng.lognormvariate(math.log(260), 0.45)
        monthly_ration = rng.random() < 0.22  # pays the month's khata / ration basket in one go
        ration_day = rng.randrange(1, 11)
        weekend_boost = 1.25
        for d in g.days(joined, left):
            p = visits_per_week / 7 * (weekend_boost if d.weekday() >= 5 else 1)
            if rng.random() < p:
                amt = min(max(typical * rng.lognormvariate(0, 0.5), 20), 1950)
                ch = rng.choices(["upi_qr", "upi_intent"], weights=[92, 8])[0]
                g.add(m.id, cid, amt, g.ts(d, "kirana"), False, ch)
            if monthly_ration and d.day == ration_day:
                g.add(m.id, cid, rng.uniform(2150, 4800), g.ts(d, "kirana"), False, "upi_qr")
    # One-off bulk / party / wedding orders from walk-in customers.
    for n in range(1, 61):
        d = g.spread(n, DAYS / 60)
        g.add(m.id, f"{m.id}-W{n:04d}", rng.uniform(2300, 9500), g.ts(d, "kirana"), False, "upi_qr")


def gen_salon(g: Gen, m: Merchant):
    rng = g.rng
    for n in range(1, 281):
        cid = f"{m.id}-C{n:04d}"
        joined, left = g.lifespan(0.2, 0.25)
        gap = rng.uniform(14, 45)
        typical = rng.lognormvariate(math.log(650), 0.4)
        nxt = joined + timedelta(days=rng.randrange(0, int(gap)))
        while nxt <= min(left, g.end):
            if nxt >= g.start:
                if rng.random() < 0.09:  # facial / keratin / hair-colour package
                    amt = rng.uniform(2400, 6500)
                else:
                    amt = min(max(typical * rng.lognormvariate(0, 0.3), 150), 1950)
                ch = rng.choices(["upi_qr", "upi_intent"], weights=[85, 15])[0]
                g.add(m.id, cid, amt, g.ts(nxt, "salon"), False, ch)
            weekend_shift = 1 if rng.random() < 0.3 else 0
            nxt += timedelta(days=max(7, int(rng.gauss(gap, gap * 0.25))) + weekend_shift)
    # Monthly membership on UPI Autopay (recurring — exempt at any amount).
    for n in range(1, 19):
        cid = f"{m.id}-M{n:04d}"
        joined, left = g.lifespan(0.2, 0.1)
        amt = rng.choice([1999, 2999, 3499])
        for d in g.days(joined, left):
            if d.day == 5:
                g.add(m.id, cid, amt, f"{d.isoformat()}T09:00:00", True, "upi_autopay")
    # One-off bridal / event bookings.
    for n in range(1, 34):
        d = g.spread(n, DAYS / 33)
        g.add(m.id, f"{m.id}-B{n:04d}", rng.uniform(8000, 26000), g.ts(d, "salon"), False, "upi_qr")


def gen_tuition(g: Gen, m: Merchant):
    rng = g.rng
    for n in range(1, 151):
        cid = f"{m.id}-S{n:04d}"
        joined, left = g.lifespan(0.2, 0.17)
        fee = rng.choice([2400, 2800, 3200, 3600, 4200, 4800])
        on_autopay = rng.random() < 0.5
        pay_day = rng.randrange(1, 11)
        for d in g.days(joined, left):
            if d.day == pay_day or (d == joined and d.day > 10):
                if on_autopay:
                    g.add(m.id, cid, fee, f"{d.isoformat()}T07:30:00", True, "upi_autopay")
                else:
                    late = timedelta(days=rng.choice([0, 0, 0, 1, 2, 4]))
                    day = min(d + late, g.end)
                    g.add(m.id, cid, fee, g.ts(day, "tuition"), False, rng.choice(["upi_qr", "upi_intent"]))
            # Books, notes, test series.
            if rng.random() < 0.012:
                g.add(m.id, cid, rng.uniform(150, 900), g.ts(d, "tuition"), False, "upi_qr")
    # One-off crash-course / admission fees from walk-ins.
    for n in range(1, 26):
        d = g.spread(n, DAYS / 25)
        g.add(m.id, f"{m.id}-A{n:04d}", rng.uniform(3500, 12000), g.ts(d, "tuition"), False, "upi_qr")


GENERATORS = {"kirana": gen_kirana, "salon": gen_salon, "tuition": gen_tuition}


def seed(force: bool = False) -> bool:
    """Returns True if data was (re)generated."""
    init_schema()
    with get_conn() as conn:
        has_data = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] > 0
        if has_data and not force:
            return False
        for table in ("transactions", "merchants", "actions_log", "chat_messages"):
            conn.execute(f"DELETE FROM {table}")

        end = end_date()
        start = end - timedelta(days=DAYS - 1)
        rng = random.Random(RNG_SEED)
        for m in MERCHANTS:
            conn.execute(
                "INSERT INTO merchants VALUES (?,?,?,?,?,?,?,?)",
                (m.id, m.name, m.category, m.persona, m.city, m.owner_name, m.gross_margin_pct, m.visibility_pct),
            )
            g = Gen(rng, start, end)
            GENERATORS[m.persona](g, m)
            g.rows = [(f"{m.id}-{r[0]}",) + r[1:] for r in g.rows]
            conn.executemany("INSERT INTO transactions VALUES (?,?,?,?,?,?,?)", g.rows)
            print(f"  {m.name:<30} {len(g.rows):>6} transactions  ({start} -> {end})")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="wipe and regenerate all data")
    args = parser.parse_args()
    print(f"Seeding {settings.database_path} ...")
    if seed(force=args.force):
        print("Done.")
    else:
        print("Database already has data — use --force to regenerate.")
