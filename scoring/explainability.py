"""
scoring/explainability.py

SHAP-based explainability for individual risk scores - this is what
turns "risk_score: 0.87" into "risk_score: 0.87, because: high
transaction velocity (+0.31), low counterparty diversity (+0.22), ..."

IMPORTANT: SHAP explanations are computed against the RAW (uncalibrated)
XGBoost model, not the calibrated wrapper - CalibratedClassifierCV wraps
the base model in a way that isn't directly SHAP-compatible for tree
explainers. This is standard practice: the calibrated probability is the
score you report, but the SHAP values from the underlying tree model
explain WHY the model leans that way. Worth stating plainly if asked,
rather than implying the explanation and the final number come from
exactly the same computation.

Output format matches the frontend SRS contract exactly (section 5):
    [{ "feature": "...", "contribution": 0.34 }, ...]

Usage:
    from scoring.explainability import explain_address
    explanation = explain_address(feature_row)  # single-row DataFrame
"""

import os

import joblib
import pandas as pd
import shap

MODEL_ARTIFACTS_DIR = "scoring/model_artifacts"

_explainer = None
_model = None


def _load_explainer():
    """Lazily loads the raw model + SHAP TreeExplainer once, reused across calls."""
    global _explainer, _model
    if _explainer is not None:
        return _explainer, _model

    model_path = os.path.join(MODEL_ARTIFACTS_DIR, "xgboost_model.joblib")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"{model_path} not found - run `python -m scoring.xgboost_model` first"
        )
    _model = joblib.load(model_path)
    _explainer = shap.TreeExplainer(_model)
    return _explainer, _model


def explain_address(feature_row: pd.DataFrame, top_n: int = 5) -> list[dict]:
    """
    Given a single-row DataFrame of engineered features (same columns as
    FEATURE_COLUMNS in scoring/features.py), returns the top_n features
    that most influenced the model's prediction, ranked by absolute SHAP
    value, in the exact {feature, contribution} shape the frontend expects.
    """
    explainer, model = _load_explainer()

    shap_values = explainer.shap_values(feature_row)

    # XGBoost binary classifier via SHAP TreeExplainer typically returns a
    # single array (SHAP value for the positive class) rather than a
    # list-per-class - handle both shapes defensively since this varies
    # across shap/xgboost version combinations.
    if isinstance(shap_values, list):
        values = shap_values[1][0]  # positive class, first (only) row
    else:
        values = shap_values[0]

    feature_names = feature_row.columns.tolist()
    contributions = list(zip(feature_names, values))
    contributions.sort(key=lambda x: abs(x[1]), reverse=True)

    return [
        {"feature": name, "contribution": round(float(value), 4)}
        for name, value in contributions[:top_n]
    ]


if __name__ == "__main__":
    # Quick manual test using one row from the saved test split.
    test_split_path = os.path.join(MODEL_ARTIFACTS_DIR, "test_split.joblib")
    if not os.path.exists(test_split_path):
        print("[explainability] test_split.joblib not found - run "
              "`python -m scoring.xgboost_model` first")
    else:
        X_test, y_test = joblib.load(test_split_path)
        sample_row = X_test.iloc[[0]]
        actual_label = y_test.iloc[0]

        explanation = explain_address(sample_row)
        print(f"[explainability] sample row (actual class_label={actual_label}):")
        print(sample_row.to_string())
        print("\n[explainability] top contributing features:")
        for item in explanation:
            direction = "pushes toward illicit" if item["contribution"] > 0 else "pushes toward licit"
            print(f"  {item['feature']}: {item['contribution']:+.4f}  ({direction})")