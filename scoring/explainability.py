"""SHAP explanations for the behavioral risk model."""

from __future__ import annotations

import os

import joblib
import pandas as pd


def _unwrap_model(model):
	if isinstance(model, dict):
		model = model.get("model")
	# CalibratedClassifierCV wraps fitted estimators. Explain the underlying
	# XGBoost estimators rather than pretending the calibrator is a tree model.
	estimators = getattr(model, "calibrated_classifiers_", None)
	if estimators:
		model = getattr(estimators[0], "estimator", model)
	return model


def explain_address(features_df: pd.DataFrame, model=None, model_path: str = "scoring/model_artifacts/calibrated_model.joblib"):
	"""Return sorted feature-level SHAP evidence for one address row.

	An empty list is returned when no compatible trained model is available;
	no explanation values are invented for an unscored trace.
	"""
	if features_df.empty:
		return []
	if model is None and os.path.exists(model_path):
		model = joblib.load(model_path)
	if model is None:
		return []
	model = _unwrap_model(model)
	try:
		import shap
		explainer = shap.TreeExplainer(model)
		values = explainer.shap_values(features_df)
	except Exception:
		return []
	if isinstance(values, list):
		values = values[-1]
	row_values = values[0]
	result = []
	for feature, value, contribution in zip(features_df.columns, features_df.iloc[0], row_values):
		contribution = float(contribution)
		result.append({
			"feature": feature,
			"value": float(value),
			"shap_value": contribution,
			"shap_contribution": contribution,
			"direction": "increases_risk" if contribution >= 0 else "decreases_risk",
		})
	return sorted(result, key=lambda item: abs(item["shap_contribution"]), reverse=True)
