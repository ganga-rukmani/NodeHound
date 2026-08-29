"""
scoring/apply_scoring.py

Applies the trained + calibrated XGBoost model to the addresses currently
sitting in your Neo4j trace graph, writing risk_score (calibrated) and
risk_score_raw (pre-calibration) back onto each node - these are the
schema fields defined all the way back in graph/schema.py's AddressNode.

This is the final step that closes the loop: BigQuery -> graph -> label ->
cluster -> rank -> SCORE -> (next: explainability output for the frontend).

Usage:
    python -m scoring.apply_scoring
"""

import os
from datetime import datetime

import joblib

from graph.neo4j_client import Neo4jClient
from scoring.features import engineer_features, FEATURE_COLUMNS
from scoring.explainability import explain_address

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "nodehound123"

MODEL_ARTIFACTS_DIR = "scoring/model_artifacts"
BIGQUERY_PROJECT_ID = "crypto-attribution-506814"

# Use a wide window here too, same reasoning as training - an address's
# behavioral pattern isn't limited to the WazirX incident window itself.
FEATURE_WINDOW_START = datetime(2020, 1, 1)
FEATURE_WINDOW_END = datetime(2024, 12, 31)

TOP_N_EXPLAIN = 5  # print full SHAP explanation for this many highest-risk nodes


def fetch_trace_addresses(client: Neo4jClient) -> list[str]:
    with client.driver.session() as session:
        records = session.run(
            "MATCH (a:Address {chain: 'ethereum'}) RETURN a.address AS address"
        )
        return [r["address"] for r in records]


def write_scores_to_neo4j(client: Neo4jClient, scored_rows: list[dict]):
    query = """
        UNWIND $batch AS row
        MATCH (a:Address {chain: 'ethereum', address: row.address})
        SET a.risk_score = row.risk_score,
            a.risk_score_raw = row.risk_score_raw
    """
    with client.driver.session() as session:
        session.run(query, batch=scored_rows)
    print(f"[apply_scoring] wrote risk_score to {len(scored_rows)} nodes in Neo4j")


def main():
    calibrated_model_path = os.path.join(MODEL_ARTIFACTS_DIR, "calibrated_model.joblib")
    if not os.path.exists(calibrated_model_path):
        print(f"[apply_scoring] {calibrated_model_path} not found - run "
              f"`python -m scoring.xgboost_model` then `python -m scoring.calibration` first")
        return

    calibrated_model = joblib.load(calibrated_model_path)
    raw_model = joblib.load(os.path.join(MODEL_ARTIFACTS_DIR, "xgboost_model.joblib"))

    client = Neo4jClient(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)
    if not client.verify_connectivity():
        print("[apply_scoring] could not connect to Neo4j")
        return

    addresses = fetch_trace_addresses(client)
    print(f"[apply_scoring] scoring {len(addresses)} addresses from the current trace...")

    features_df = engineer_features(
        addresses, FEATURE_WINDOW_START, FEATURE_WINDOW_END, BIGQUERY_PROJECT_ID
    )

    if features_df.empty:
        print("[apply_scoring] no features returned - check the trace has addresses "
              "with real on-chain activity")
        client.close()
        return

    X = features_df[FEATURE_COLUMNS]
    calibrated_proba = calibrated_model.predict_proba(X)[:, 1]
    raw_proba = raw_model.predict_proba(X)[:, 1]

    scored_rows = [
        {
            "address": addr,
            "risk_score": round(float(cal_score), 4),
            "risk_score_raw": round(float(raw_score), 4),
        }
        for addr, cal_score, raw_score in zip(features_df["address"], calibrated_proba, raw_proba)
    ]

    write_scores_to_neo4j(client, scored_rows)

    # Print the highest-risk nodes with full SHAP explanations - this is
    # your actual demo output: "here's why we flagged this address."
    scored_rows_sorted = sorted(scored_rows, key=lambda r: r["risk_score"], reverse=True)

    print(f"\n[apply_scoring] === Top {TOP_N_EXPLAIN} highest-risk addresses in this trace ===")
    for row in scored_rows_sorted[:TOP_N_EXPLAIN]:
        print(f"\n  {row['address']}")
        print(f"    risk_score (calibrated): {row['risk_score']}")
        print(f"    risk_score_raw:          {row['risk_score_raw']}")

        feature_row = features_df[features_df["address"] == row["address"]][FEATURE_COLUMNS]
        try:
            explanation = explain_address(feature_row, top_n=5)
            print(f"    top contributing factors:")
            for item in explanation:
                print(f"      {item['feature']}: {item['contribution']:+.4f}")
        except Exception as e:
            print(f"    (explainability failed: {e})")

    client.close()


if __name__ == "__main__":
    main()