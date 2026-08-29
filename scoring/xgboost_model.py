"""
scoring/xgboost_model.py

Trains the core risk-scoring model: XGBoost on engineered graph/behavioral
features (scoring/features.py), using the weakly-supervised training set
(scoring/build_training_set.py).

This is the direct replacement for the original problem statement's
arbitrary point-scoring table - every score here comes from a model
trained on real (if weakly-labeled) data, evaluable with real metrics,
and explainable via SHAP (scoring/explainability.py).

Data split: train / calibration / test (60/20/20). The calibration split
is held out specifically for scoring/calibration.py - never trained on,
so the calibrated probabilities are honest, not circular.

Usage:
    python -m scoring.xgboost_model
Output:
    scoring/model_artifacts/xgboost_model.joblib
    scoring/model_artifacts/feature_columns.json
    scoring/model_artifacts/calibration_split.joblib  (features+labels, for calibration.py)
    scoring/model_artifacts/test_split.joblib          (held-out, for final evaluation)
"""

import json
import os
from datetime import datetime

import joblib
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score,
    classification_report,
)
from xgboost import XGBClassifier

from scoring.features import engineer_features, FEATURE_COLUMNS

TRAINING_ADDRESSES_PATH = "scoring/training_addresses.csv"
MODEL_ARTIFACTS_DIR = "scoring/model_artifacts"
BIGQUERY_PROJECT_ID = "crypto-attribution-506814"

# Behavioral features need a wide window to capture each address's real
# activity pattern - training addresses weren't all active during the
# WazirX incident window specifically, so this is intentionally broad.
FEATURE_WINDOW_START = datetime(2020, 1, 1)
FEATURE_WINDOW_END = datetime(2024, 12, 31)

# BigQuery ARRAY parameters are cheap but let's chunk defensively for
# very large training sets rather than sending thousands of addresses in
# one query.
FEATURE_QUERY_CHUNK_SIZE = 500


def load_training_addresses() -> pd.DataFrame:
    if not os.path.exists(TRAINING_ADDRESSES_PATH):
        raise FileNotFoundError(
            f"{TRAINING_ADDRESSES_PATH} not found - run "
            f"`python -m scoring.build_training_set` first"
        )
    return pd.read_csv(TRAINING_ADDRESSES_PATH)


def engineer_features_in_chunks(addresses: list[str]) -> pd.DataFrame:
    """Wraps engineer_features with chunking so large training sets don't
    hit BigQuery ARRAY parameter limits or timeouts in one giant query."""
    chunks = []
    for i in range(0, len(addresses), FEATURE_QUERY_CHUNK_SIZE):
        chunk = addresses[i : i + FEATURE_QUERY_CHUNK_SIZE]
        print(f"[xgboost_model] engineering features for addresses "
              f"{i + 1}-{i + len(chunk)} of {len(addresses)}...")
        df_chunk = engineer_features(
            chunk, FEATURE_WINDOW_START, FEATURE_WINDOW_END, BIGQUERY_PROJECT_ID
        )
        chunks.append(df_chunk)
    return pd.concat(chunks, ignore_index=True)


def main():
    os.makedirs(MODEL_ARTIFACTS_DIR, exist_ok=True)

    print("[xgboost_model] loading training addresses...")
    training_df = load_training_addresses()
    training_df["address"] = training_df["address"].str.lower()

    print(f"[xgboost_model] engineering features for {len(training_df)} addresses "
          f"(this will take a while - one or more BigQuery calls)...")
    features_df = engineer_features_in_chunks(training_df["address"].tolist())

    merged = training_df.merge(features_df, on="address", how="inner")
    print(f"[xgboost_model] merged dataset: {len(merged)} addresses with features "
          f"(dropped {len(training_df) - len(merged)} with no on-chain activity found)")

    X = merged[FEATURE_COLUMNS]
    y = merged["class_label"]

    # 60/20/20 split: train / calibration (held for calibration.py) / test
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.4, random_state=42, stratify=y
    )
    X_calib, X_test, y_calib, y_test = train_test_split(
        X_temp, y_temp, test_size=0.5, random_state=42, stratify=y_temp
    )

    print(f"[xgboost_model] split: {len(X_train)} train, {len(X_calib)} calibration, "
          f"{len(X_test)} test")

    # scale_pos_weight helps XGBoost handle class imbalance (illicit class
    # is almost certainly much smaller than licit) without needing to
    # artificially undersample the majority class.
    pos_count = (y_train == 1).sum()
    neg_count = (y_train == 0).sum()
    scale_pos_weight = neg_count / max(pos_count, 1)

    print(f"[xgboost_model] training XGBoost (scale_pos_weight={scale_pos_weight:.2f})...")
    model = XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.1,
        scale_pos_weight=scale_pos_weight,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train)

    # --- evaluation on the held-out test set ---
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    print("\n[xgboost_model] === Test set evaluation (raw, uncalibrated model) ===")
    print(f"  Accuracy:  {accuracy_score(y_test, y_pred):.4f}")
    print(f"  Precision: {precision_score(y_test, y_pred, zero_division=0):.4f}")
    print(f"  Recall:    {recall_score(y_test, y_pred, zero_division=0):.4f}")
    print(f"  F1:        {f1_score(y_test, y_pred, zero_division=0):.4f}")
    try:
        print(f"  ROC-AUC:   {roc_auc_score(y_test, y_proba):.4f}")
    except ValueError:
        print("  ROC-AUC:   undefined (test set may have only one class present)")
    print("\n" + classification_report(y_test, y_pred, zero_division=0))

    # --- feature importance, for a quick sanity check against SHAP later ---
    importances = sorted(
        zip(FEATURE_COLUMNS, model.feature_importances_), key=lambda x: x[1], reverse=True
    )
    print("[xgboost_model] feature importances (gain-based):")
    for feat, imp in importances:
        print(f"  {feat}: {imp:.4f}")

    # --- save everything scoring/calibration.py and explainability.py need ---
    joblib.dump(model, os.path.join(MODEL_ARTIFACTS_DIR, "xgboost_model.joblib"))
    joblib.dump((X_calib, y_calib), os.path.join(MODEL_ARTIFACTS_DIR, "calibration_split.joblib"))
    joblib.dump((X_test, y_test), os.path.join(MODEL_ARTIFACTS_DIR, "test_split.joblib"))

    with open(os.path.join(MODEL_ARTIFACTS_DIR, "feature_columns.json"), "w") as f:
        json.dump(FEATURE_COLUMNS, f)

    print(f"\n[xgboost_model] saved model + splits to {MODEL_ARTIFACTS_DIR}/")
    print("[xgboost_model] next: run `python -m scoring.calibration` to calibrate "
          "these raw probabilities against the held-out calibration split")


if __name__ == "__main__":
    main()