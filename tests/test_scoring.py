from types import SimpleNamespace

import pandas as pd
import numpy as np

import scoring.features as features
from scoring.explainability import explain_address
from scoring.xgboost_model import validate_training_frame
from scoring.chain_features import CHAIN_FEATURE_COLUMNS, build_chain_features, feature_columns_for_chain
from scoring.chain_model import predict_risk
from graph.schema import AddressNode, Chain, TransferEdge


def test_engineer_features_handles_malformed_and_zero_activity(monkeypatch):
    fake_bigquery = SimpleNamespace(
        Client=lambda project: SimpleNamespace(
            query=lambda query, job_config: SimpleNamespace(result=lambda: [])
        ),
        ArrayQueryParameter=lambda *args: args,
        ScalarQueryParameter=lambda *args: args,
        QueryJobConfig=lambda **kwargs: kwargs,
    )
    monkeypatch.setattr(features, "bigquery", fake_bigquery)

    result = features.engineer_features(["bad", "0x" + "1" * 40], None, None, "project")

    assert list(result.columns) == ["address", *features.FEATURE_COLUMNS]
    assert len(result) == 1
    assert result.iloc[0][features.FEATURE_COLUMNS].sum() == 0


def test_validate_training_frame_rejects_one_class():
    frame = pd.DataFrame({"feature": [1, 2], "label": [0, 0]})
    try:
        validate_training_frame(frame, ["feature"])
    except ValueError as error:
        assert "both positive and negative" in str(error)
    else:
        raise AssertionError("one-class training data must be rejected")


def test_explainability_is_empty_without_model():
    columns = features.FEATURE_COLUMNS
    frame = pd.DataFrame([[0.0] * len(columns)], columns=columns)
    assert explain_address(frame, model=None, model_path="missing-model.joblib") == []


def test_chain_schemas_exclude_label_derived_features():
    forbidden = {"label_signal", "risk_proximity", "sanctioned", "risk_score", "attribution"}
    for columns in CHAIN_FEATURE_COLUMNS.values():
        assert not forbidden.intersection(columns)


def test_chain_feature_extractors_preserve_chain_specific_fields():
    for chain, token in ((Chain.ETHEREUM, "USDT"), (Chain.TRON, "USDT"), (Chain.BITCOIN, "BTC")):
        seed = AddressNode(chain, "seed")
        target = AddressNode(chain, "target")
        edges = [TransferEdge(chain, "tx", "seed", "target", token, 2)]
        frame = build_chain_features([seed, target], edges, "seed")
        assert list(frame.columns) == ["address", *feature_columns_for_chain(chain.value)]
        if chain == Chain.BITCOIN:
            assert "utxo_inferred_edges" in frame.columns
        else:
            assert "token_transfer_count" in frame.columns


def test_predict_risk_reports_missing_chain_model():
    frame = pd.DataFrame([[0.0] * len(CHAIN_FEATURE_COLUMNS["tron"])], columns=CHAIN_FEATURE_COLUMNS["tron"])
    result = predict_risk("tron", frame, {"model_available": False, "status": "INSUFFICIENT_VALID_TRAINING_DATA"})
    assert result["model_available"] is False
    assert result["risk_score"] is None


def test_predict_risk_uses_artifact_feature_schema():
    class Model:
        def predict_proba(self, values):
            assert list(values.columns) == CHAIN_FEATURE_COLUMNS["bitcoin"]
            return np.array([[0.2, 0.8]])

    frame = pd.DataFrame([[0.0] * len(CHAIN_FEATURE_COLUMNS["bitcoin"])], columns=CHAIN_FEATURE_COLUMNS["bitcoin"])
    result = predict_risk("bitcoin", frame, {"model_available": True, "model": Model()})
    assert result["risk_score"] == [0.8]
    assert result["risk_category"] == ["HIGH"]