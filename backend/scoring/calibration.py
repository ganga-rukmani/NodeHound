"""Defensible probability calibration for trained binary classifiers."""

from __future__ import annotations

import json
import os
import argparse

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

from scoring.xgboost_model import _classifier, validate_training_frame


def train_calibrated(frame: pd.DataFrame, feature_columns: list[str], test_size: float = 0.2, random_state: int = 42):
	clean = validate_training_frame(frame, feature_columns)
	x_train, x_test, y_train, y_test = train_test_split(
		clean[feature_columns], clean["label"].astype(int), test_size=test_size,
		random_state=random_state, stratify=clean["label"].astype(int),
	)
	smallest_class = int(y_train.value_counts().min())
	if smallest_class < 3:
		raise ValueError("At least three training examples per class are required for calibrated probabilities")
	base = _classifier(random_state=random_state)
	calibrated = CalibratedClassifierCV(base, method="sigmoid", cv=min(3, smallest_class))
	calibrated.fit(x_train, y_train)
	probabilities = calibrated.predict_proba(x_test)[:, 1]
	predictions = (probabilities >= 0.5).astype(int)
	metrics = {
		"rows": int(len(clean)),
		"features": list(feature_columns),
		"roc_auc": float(roc_auc_score(y_test, probabilities)),
		"average_precision": float(average_precision_score(y_test, probabilities)),
		"precision": float(precision_score(y_test, predictions, zero_division=0)),
		"recall": float(recall_score(y_test, predictions, zero_division=0)),
		"f1": float(f1_score(y_test, predictions, zero_division=0)),
		"calibration": "sigmoid",
		"random_state": random_state,
	}
	return calibrated, metrics


def save_calibrated_model(model, path: str, feature_columns: list[str], metrics: dict) -> str:
	os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
	joblib.dump({"model": model, "feature_columns": feature_columns, "metrics": metrics, "calibrated": True}, path)
	with open(os.path.splitext(path)[0] + "_metrics.json", "w", encoding="utf-8") as handle:
		json.dump(metrics, handle, indent=2)
	return path


def load_calibrated_model(path: str) -> dict:
	if not os.path.exists(path):
		raise FileNotFoundError(path)
	artifact = joblib.load(path)
	if not isinstance(artifact, dict) or "model" not in artifact:
		raise ValueError("Model artifact must contain a model and feature_columns")
	if not artifact.get("calibrated"):
		raise ValueError("Model artifact is not marked as calibrated")
	return artifact


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("input_csv")
	parser.add_argument("--output", default="scoring/model_artifacts/calibrated_model.joblib")
	args = parser.parse_args()
	from scoring.features import FEATURE_COLUMNS

	trained_model, trained_metrics = train_calibrated(pd.read_csv(args.input_csv), FEATURE_COLUMNS)
	save_calibrated_model(trained_model, args.output, FEATURE_COLUMNS, trained_metrics)
	print(json.dumps(trained_metrics, indent=2))
