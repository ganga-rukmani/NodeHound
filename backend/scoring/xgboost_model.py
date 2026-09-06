"""Reusable XGBoost training, persistence, and prediction helpers."""

from __future__ import annotations

import os
from typing import Iterable

import joblib
import pandas as pd


def _classifier(**kwargs):
	from xgboost import XGBClassifier

	return XGBClassifier(
		n_estimators=kwargs.pop("n_estimators", 200),
		max_depth=kwargs.pop("max_depth", 4),
		learning_rate=kwargs.pop("learning_rate", 0.05),
		subsample=kwargs.pop("subsample", 0.8),
		colsample_bytree=kwargs.pop("colsample_bytree", 0.8),
		eval_metric="logloss",
		random_state=kwargs.pop("random_state", 42),
		**kwargs,
	)


def validate_training_frame(frame: pd.DataFrame, feature_columns: Iterable[str]) -> pd.DataFrame:
	columns = list(feature_columns)
	missing = [column for column in [*columns, "label"] if column not in frame.columns]
	if missing:
		raise ValueError(f"Training data is missing columns: {', '.join(missing)}")
	clean = frame[columns + ["label"]].dropna()
	if clean.empty or clean["label"].nunique() < 2:
		raise ValueError("Training data must contain both positive and negative classes")
	labels = set(clean["label"].astype(int).unique())
	if not labels.issubset({0, 1}):
		raise ValueError("Training labels must be binary 0/1")
	return clean


def train_classifier(frame: pd.DataFrame, feature_columns: Iterable[str], **kwargs):
	clean = validate_training_frame(frame, feature_columns)
	columns = list(feature_columns)
	model = _classifier(**kwargs)
	model.fit(clean[columns], clean["label"].astype(int))
	return model, columns


def predict_proba(model_or_artifact, features: pd.DataFrame, feature_columns: Iterable[str] | None = None):
	model = model_or_artifact.get("model", model_or_artifact) if isinstance(model_or_artifact, dict) else model_or_artifact
	columns = feature_columns
	if columns is None and isinstance(model_or_artifact, dict):
		columns = model_or_artifact.get("feature_columns")
	if columns is not None:
		features = features[list(columns)]
	return model.predict_proba(features)[:, 1]


def save_model(model, path: str, feature_columns: Iterable[str], metadata: dict | None = None) -> str:
	os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
	artifact = {"model": model, "feature_columns": list(feature_columns)}
	if metadata:
		artifact.update(metadata)
	joblib.dump(artifact, path)
	return path


def load_model(path: str) -> dict:
	if not os.path.exists(path):
		raise FileNotFoundError(path)
	artifact = joblib.load(path)
	if not isinstance(artifact, dict) or "model" not in artifact:
		artifact = {"model": artifact}
	return artifact
