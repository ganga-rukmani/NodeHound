"""Common inference interface for chain-specific calibrated models."""

from __future__ import annotations

import os

import joblib

from scoring.chain_features import feature_columns_for_chain


MODEL_FILENAMES = {
    "ethereum": "ethereum_calibrated_model.joblib",
    "bitcoin": "bitcoin_calibrated_model.joblib",
    "tron": "tron_calibrated_model.joblib",
}


def model_path(chain: str, artifact_dir: str = "scoring/model_artifacts") -> str:
    if chain not in MODEL_FILENAMES:
        raise ValueError(f"Unsupported chain: {chain}")
    return os.path.join(artifact_dir, MODEL_FILENAMES[chain])


def load_chain_model(chain: str, artifact_dir: str = "scoring/model_artifacts") -> dict:
    path = model_path(chain, artifact_dir)
    if not os.path.exists(path):
        return {"chain": chain, "model_available": False, "status": "INSUFFICIENT_VALID_TRAINING_DATA", "path": path}
    artifact = joblib.load(path)
    if not isinstance(artifact, dict) or "model" not in artifact:
        return {"chain": chain, "model_available": False, "status": "INVALID_MODEL_ARTIFACT", "path": path}
    expected = feature_columns_for_chain(chain)
    if artifact.get("chain") not in (None, chain) or artifact.get("feature_columns") != expected:
        return {"chain": chain, "model_available": False, "status": "MODEL_SCHEMA_MISMATCH", "path": path}
    artifact["model_available"] = True
    artifact["status"] = "READY"
    artifact["path"] = path
    return artifact


def predict_risk(chain: str, features, artifact: dict | None = None) -> dict:
    artifact = artifact or load_chain_model(chain)
    if not artifact.get("model_available"):
        return {"chain": chain, "risk_score": None, "risk_category": "UNAVAILABLE", "model_available": False, "status": artifact.get("status"), "feature_values": features.to_dict(orient="records"), "feature_columns": list(features.columns)}
    columns = feature_columns_for_chain(chain)
    model = artifact["model"]
    scores = model.predict_proba(features[columns])[:, 1]
    return {"chain": chain, "risk_score": scores.tolist(), "risk_category": [risk_category(score) for score in scores], "model_available": True, "status": "READY", "model_version": artifact.get("model_version"), "feature_values": features[columns].to_dict(orient="records"), "feature_columns": columns}


def risk_category(score: float | None) -> str:
    if score is None:
        return "UNAVAILABLE"
    if score >= 0.75:
        return "HIGH"
    if score >= 0.45:
        return "MEDIUM"
    return "LOW"