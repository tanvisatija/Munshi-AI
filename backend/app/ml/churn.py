"""RFM churn-risk model (scikit-learn gradient boosting).

Label heuristic: a customer has churned if they make no purchase in the 45 days after
a snapshot date. Training uses two historical snapshots per merchant (as_of-45d and
as_of-75d), pooled across all merchants; features are cadence-normalised so a salon
customer's monthly rhythm and a kirana regular's twice-weekly rhythm are comparable.
Scoring uses features as of today.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from threading import Lock
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from ..engine.context import load_merchants, load_transactions
from ..engine.stats import as_of_date

log = logging.getLogger("munshi.ml")

CHURN_DAYS = 45
FEATURES = [
    "recency_days", "frequency", "monetary", "avg_ticket",
    "tenure_days", "avg_gap_days", "recency_gap_ratio", "recurring_share",
]


def customer_features(tx: pd.DataFrame, snapshot: pd.Timestamp) -> pd.DataFrame:
    hist = tx[tx["timestamp"] < snapshot]
    if hist.empty:
        return pd.DataFrame(columns=FEATURES)
    g = hist.groupby("customer_id")
    first, last = g["timestamp"].min(), g["timestamp"].max()
    df = pd.DataFrame({
        "recency_days": (snapshot - last).dt.total_seconds() / 86400,
        "frequency": g.size(),
        "monetary": g["amount"].sum(),
        "avg_ticket": g["amount"].mean(),
        "tenure_days": (snapshot - first).dt.total_seconds() / 86400,
        "recurring_share": g["is_recurring"].mean(),
    })
    span = (last - first).dt.total_seconds() / 86400
    df["avg_gap_days"] = np.where(df["frequency"] > 1, span / (df["frequency"] - 1).clip(lower=1), df["tenure_days"])
    df["recency_gap_ratio"] = df["recency_days"] / df["avg_gap_days"].clip(lower=1)
    return df[FEATURES]


def labelled_snapshot(tx: pd.DataFrame, snapshot: pd.Timestamp) -> pd.DataFrame:
    feats = customer_features(tx, snapshot)
    future = tx[(tx["timestamp"] >= snapshot) & (tx["timestamp"] < snapshot + pd.Timedelta(days=CHURN_DAYS))]
    feats["churned"] = (~feats.index.isin(future["customer_id"].unique())).astype(int)
    return feats


@dataclass
class ChurnModel:
    model: GradientBoostingClassifier | None = None
    metrics: dict[str, Any] = field(default_factory=dict)

    def train(self) -> None:
        frames = []
        for m in load_merchants():
            tx = load_transactions(m["id"])
            if tx.empty:
                continue
            as_of = as_of_date(tx)
            for back in (CHURN_DAYS, CHURN_DAYS + 30):
                frames.append(labelled_snapshot(tx, as_of - pd.Timedelta(days=back)))
        data = pd.concat(frames)
        data = data[data["frequency"] >= 2]  # churn only makes sense for customers who came back at least once
        X, y = data[FEATURES].to_numpy(), data["churned"].to_numpy()
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=7, stratify=y)
        clf = GradientBoostingClassifier(n_estimators=150, max_depth=3, learning_rate=0.08, random_state=7)
        clf.fit(X_tr, y_tr)
        auc = roc_auc_score(y_te, clf.predict_proba(X_te)[:, 1])
        clf.fit(X, y)  # final model on all rows
        self.model = clf
        self.metrics = {
            "algorithm": "GradientBoostingClassifier (scikit-learn)",
            "label": f"No repeat purchase within {CHURN_DAYS} days of the snapshot",
            "training_rows": int(len(data)),
            "churn_rate": round(float(y.mean()), 3),
            "holdout_auc": round(float(auc), 3),
            "feature_importance": {
                f: round(float(v), 3)
                for f, v in sorted(zip(FEATURES, clf.feature_importances_), key=lambda p: -p[1])
            },
        }
        log.info("Churn model trained: %s", self.metrics)

    def score(self, tx: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
        if self.model is None:
            self.train()
        feats = customer_features(tx, as_of)
        feats = feats[feats["frequency"] >= 2].copy()
        if feats.empty:
            feats["risk"] = []
            return feats
        feats["risk"] = self.model.predict_proba(feats[FEATURES].to_numpy())[:, 1]
        months_active = (feats["tenure_days"] - feats["recency_days"]).clip(lower=30) / 30
        feats["monthly_value"] = feats["monetary"] / months_active
        return feats.sort_values("risk", ascending=False)


_model = ChurnModel()
_lock = Lock()


def get_model() -> ChurnModel:
    with _lock:
        if _model.model is None:
            _model.train()
    return _model


def reset_model() -> None:
    with _lock:
        _model.model = None
        _model.metrics = {}
