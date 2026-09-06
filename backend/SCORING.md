# NodeHound scoring

The primary Ethereum model uses only behavioral features from
`scoring/features.py`: native in/out counts and value, sender/receiver
diversity, fan ratio, ERC-20 counts and diversity, active days, transaction
velocity, and the outgoing/incoming value ratio. Labels and graph proximity
are never model inputs.

Training labels are built from the existing label provenance. Sanctioned,
mixer, and scam/heist categories are positive; exchange, bridge, contract or
token, and verified entity categories are negative. Unknown categories are
excluded rather than guessed. The preparation script retains label source,
source type, confidence, and timestamp.

The training command uses a stratified holdout and sigmoid calibration when
each class has at least three training examples. Metrics include ROC-AUC,
average precision, precision, recall, and F1. A calibrated output may be
called a probability; an uncalibrated model output is only a raw score.

SHAP evidence is calculated from the fitted XGBoost tree model and sorted by
absolute contribution. Missing artifacts return no SHAP evidence.

Attribution remains separate from risk scoring. Known sanctions can receive
`known_sanctioned`; other candidates are ranked using labels, graph paths,
fund continuity, timing, proximity, behavioral risk, and SHAP evidence.

**Risk score is a behavioral risk estimate and is not proof of attacker ownership.**

## Commands

```powershell
python -m pip install -r requirements.txt
python scripts/build_training_dataset.py --project-id $env:GCP_PROJECT_ID
python -m scoring.calibration data/training/ethereum_behavioral.csv --output scoring/model_artifacts/calibrated_model.joblib
python -m uvicorn api.main:app --reload
```

The training dataset requires live BigQuery access and valid Google
credentials. No model artifact is created until that command completes with
real labels and features.

## Chain graph models

For a real trace JSON and matching label CSV, build a chain-specific table and
train only that chain's graph feature vector:

```powershell
python -m scripts.build_chain_training_dataset path\to\trace.json path\to\labels.csv --output data\training\tron_graph.csv
python -m scoring.train_chain_models tron data\training\tron_graph.csv
```

Use the same commands with `ethereum` or `bitcoin` and their matching label
source. The builder removes node labels and existing risk scores before graph
feature extraction, and rejects one-class data. Demo fixtures are for UI
behavior only and must not be used as model training data.