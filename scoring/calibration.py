"""
scoring/calibration.py

Calibrates the raw XGBoost model's output probabilities using isotonic
regression, fit on the held-out calibration split (never seen during
training - see scoring/xgboost_model.py).

Why this matters: a raw XGBoost probability of "0.9" does NOT reliably
mean "90% likely" - tree ensembles are known to produce overconfident,
poorly-calibrated probabilities. Isotonic calibration remaps the raw
scores against real observed outcomes on held-out data, so a calibrated
0.9 actually means something closer to "9 out of 10 similar cases were
truly positive" - this is the honest answer to a judge asking
"how do you know 92% confidence actually means 92%?".

Usage:
    python -m scoring.calibration
Output:
    scoring/model_artifacts/calibrated_model.joblib
"""

import os

import joblib
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.metrics import brier_score_loss, roc_auc_score

MODEL_ARTIFACTS_DIR = "scoring/model_artifacts"


def main():
    model_path = os.path.join(MODEL_ARTIFACTS_DIR, "xgboost_model.joblib")
    calib_split_path = os.path.join(MODEL_ARTIFACTS_DIR, "calibration_split.joblib")
    test_split_path = os.path.join(MODEL_ARTIFACTS_DIR, "test_split.joblib")

    for path in (model_path, calib_split_path, test_split_path):
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"{path} not found - run `python -m scoring.xgboost_model` first"
            )

    print("[calibration] loading trained model and calibration split...")
    model = joblib.load(model_path)
    X_calib, y_calib = joblib.load(calib_split_path)
    X_test, y_test = joblib.load(test_split_path)

    print(f"[calibration] calibrating on {len(X_calib)} held-out examples "
          f"(isotonic regression)...")

        # FrozenEstimator wraps the already-trained model so
    # CalibratedClassifierCV does not retrain it - it just fits the
    # calibration mapping on top of its existing predictions using the
    # calibration split. (Replaces the deprecated cv="prefit" API.)
    calibrated_model = CalibratedClassifierCV(FrozenEstimator(model), method="isotonic")
    calibrated_model.fit(X_calib, y_calib)

    # --- compare raw vs calibrated on the (still-untouched) test split ---
    raw_proba = model.predict_proba(X_test)[:, 1]
    calibrated_proba = calibrated_model.predict_proba(X_test)[:, 1]

    raw_brier = brier_score_loss(y_test, raw_proba)
    calibrated_brier = brier_score_loss(y_test, calibrated_proba)

    print("\n[calibration] === Calibration quality on held-out test set ===")
    print(f"  Brier score (lower is better - measures probability accuracy):")
    print(f"    Raw model:        {raw_brier:.4f}")
    print(f"    Calibrated model: {calibrated_brier:.4f}")
    if calibrated_brier < raw_brier:
        print("    -> Calibration improved probability accuracy, as expected.")
    else:
        print("    -> Calibration did not improve Brier score on this test set - "
              "worth investigating with more calibration data if this persists "
              "(small calibration splits can produce noisy isotonic fits).")

    try:
        print(f"  ROC-AUC (unaffected by calibration, sanity check only): "
              f"{roc_auc_score(y_test, calibrated_proba):.4f}")
    except ValueError:
        pass

    joblib.dump(calibrated_model, os.path.join(MODEL_ARTIFACTS_DIR, "calibrated_model.joblib"))
    print(f"\n[calibration] saved calibrated model to "
          f"{MODEL_ARTIFACTS_DIR}/calibrated_model.joblib")
    print("[calibration] next: run `python -m scoring.explainability` to test SHAP "
          "explanations, or `python -m scoring.apply_scoring` to score your live trace")


if __name__ == "__main__":
    main()