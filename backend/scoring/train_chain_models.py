"""Train and evaluate a chain-specific risk model from labeled feature data.

The command expects a CSV containing the feature columns for one chain and a
binary `label` column. It intentionally refuses to train without labels.
"""

import argparse
import json
import os

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from scoring.chain_features import feature_columns_for_chain


def _validate_frame(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    forbidden = {"label_signal", "risk_proximity", "sanctioned", "attribution", "risk_score"}
    leaked = sorted(set(columns) & forbidden)
    if leaked:
        raise ValueError(f"Target-derived features are forbidden: {', '.join(leaked)}")
    missing = [column for column in columns + ["label"] if column not in frame.columns]
    if missing:
        raise ValueError(f"Training data is missing columns: {', '.join(missing)}")
    clean = frame.dropna(subset=columns + ["label"]).copy()
    clean["label"] = clean["label"].astype(int)
    if not set(clean["label"].unique()).issubset({0, 1}) or clean["label"].nunique() < 2:
        raise ValueError("Training data must contain binary positive and negative labels")
    if clean["label"].value_counts().min() < 5:
        raise ValueError("Each class needs at least five examples for a calibrated chain model")
    return clean


def train(chain: str, input_csv: str, output_dir: str) -> dict:
    columns = feature_columns_for_chain(chain)
    frame = _validate_frame(pd.read_csv(input_csv), columns)
    x_train, x_test, y_train, y_test = train_test_split(
        frame[columns], frame["label"], test_size=0.2, random_state=42, stratify=frame["label"]
    )
    class_counts = y_train.value_counts()
    base = XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.05, subsample=0.8,
        colsample_bytree=0.8, eval_metric="logloss", random_state=42,
        scale_pos_weight=float(class_counts[0] / class_counts[1]),
    )
    calibrated = CalibratedClassifierCV(base, method="sigmoid", cv=min(3, int(class_counts.min())))
    calibrated.fit(x_train, y_train)
    probabilities = calibrated.predict_proba(x_test)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)
    metrics = {
        "chain": chain, "rows": len(frame), "features": columns,
        "positive": int(frame["label"].sum()), "negative": int((frame["label"] == 0).sum()),
        "validation": "stratified 80/20 holdout; calibration fit on training fold",
        "roc_auc": roc_auc_score(y_test, probabilities),
        "average_precision": average_precision_score(y_test, probabilities),
        "precision": precision_score(y_test, predictions, zero_division=0),
        "recall": recall_score(y_test, predictions, zero_division=0),
        "f1": f1_score(y_test, predictions, zero_division=0),
    }
    os.makedirs(output_dir, exist_ok=True)
    artifact = os.path.join(output_dir, f"{chain}_calibrated_model.joblib")
    joblib.dump({"model": calibrated, "feature_columns": columns, "chain": chain, "metrics": metrics, "calibrated": True}, artifact)
    with open(os.path.join(output_dir, f"{chain}_metrics.json"), "w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2)
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("chain", choices=["ethereum", "tron", "bitcoin"])
    parser.add_argument("input_csv")
    parser.add_argument("--output-dir", default="scoring/model_artifacts")
    arguments = parser.parse_args()
    print(json.dumps(train(arguments.chain, arguments.input_csv, arguments.output_dir), indent=2))