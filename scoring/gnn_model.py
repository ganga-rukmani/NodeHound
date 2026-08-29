"""
scoring/gnn_model.py

GraphSAGE model trained directly on the Elliptic Bitcoin dataset - the
standard peer-reviewed academic benchmark for exactly this task (illicit
transaction classification via graph neural networks). This is a
DELIBERATELY DIFFERENT positioning from scoring/xgboost_model.py:

  - XGBoost = your production model, trained on YOUR OWN engineered
    features from live Ethereum data (weakly-supervised, real addresses)
  - GNN = your advanced-technique demonstration, trained on the GOLD-
    STANDARD ACADEMIC dataset that the field itself uses to benchmark
    exactly this kind of model. This is a stronger, more honest framing
    than trying to force a GNN onto your own thinner live data - you're
    not claiming the GNN beats XGBoost on your data, you're demonstrating
    GNN competency on the dataset built for that purpose.

Talking point if asked "why train the GNN on a different dataset than
your live model": "Elliptic already provides the labeled, feature-rich
graph structure GNNs need to be evaluated properly - re-deriving that
from our own thinner live label coverage would be a weaker benchmark,
not a stronger one."

Requires: pip install torch torch_geometric --break-system-packages
(large install, budget real setup time)

Usage:
    python -m scoring.gnn_model
"""

import os

import pandas as pd
import torch
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.nn import SAGEConv
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

ELLIPTIC_DIR = "data/labels/bitcoin"
FEATURES_PATH = os.path.join(ELLIPTIC_DIR, "elliptic_txs_features.csv")
CLASSES_PATH = os.path.join(ELLIPTIC_DIR, "elliptic_txs_classes.csv")
EDGELIST_PATH = os.path.join(ELLIPTIC_DIR, "elliptic_txs_edgelist.csv")

MODEL_OUTPUT_PATH = "scoring/model_artifacts/gnn_model.pt"

HIDDEN_DIM = 64
EPOCHS = 100
LEARNING_RATE = 0.01


class GraphSAGE(torch.nn.Module):
    """Simple 2-layer GraphSAGE - a well-established, not-overengineered
    choice for this benchmark size (~46K labeled nodes)."""

    def __init__(self, in_channels: int, hidden_channels: int):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, 2)  # binary: licit / illicit

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.3, training=self.training)
        x = self.conv2(x, edge_index)
        return x


def load_elliptic_as_pyg_data() -> tuple[Data, dict]:
    """
    Builds a PyG Data object from the raw Elliptic CSVs. Uses Elliptic's
    OWN time_step field for a temporal train/test split (the methodologically
    correct approach the dataset's authors recommend - avoids leakage that
    a random split could introduce, since transactions in later time steps
    can depend on structure from earlier ones).
    """
    print("[gnn_model] loading Elliptic dataset...")
    features = pd.read_csv(FEATURES_PATH, header=None)
    features.columns = ["txId", "time_step"] + [f"feat_{i}" for i in range(165)]

    classes = pd.read_csv(CLASSES_PATH)
    classes.columns = ["txId", "class"]

    edges = pd.read_csv(EDGELIST_PATH)
    edges.columns = ["txId1", "txId2"]

    merged = features.merge(classes, on="txId", how="left")

    # Map txId -> contiguous 0-indexed node index (required for PyG edge_index)
    txid_to_idx = {txid: i for i, txid in enumerate(merged["txId"])}

    x = torch.tensor(merged[[f"feat_{i}" for i in range(165)]].values, dtype=torch.float)

    # class: '1' = illicit -> label 1, '2' = licit -> label 0, 'unknown' -> -1 (excluded from loss)
    label_map = {"1": 1, "2": 0, "unknown": -1}
    y = torch.tensor(merged["class"].map(label_map).values, dtype=torch.long)

    edge_index_list = []
    for _, row in edges.iterrows():
        if row["txId1"] in txid_to_idx and row["txId2"] in txid_to_idx:
            edge_index_list.append([txid_to_idx[row["txId1"]], txid_to_idx[row["txId2"]]])
    edge_index = torch.tensor(edge_index_list, dtype=torch.long).t().contiguous()

    time_steps = torch.tensor(merged["time_step"].values, dtype=torch.long)

    data = Data(x=x, edge_index=edge_index, y=y)
    print(f"[gnn_model] graph: {data.num_nodes} nodes, {data.num_edges} edges, "
          f"{(y == 1).sum().item()} illicit, {(y == 0).sum().item()} licit, "
          f"{(y == -1).sum().item()} unknown (excluded from training/eval)")

    return data, {"time_steps": time_steps, "txid_to_idx": txid_to_idx}


def main():
    if not os.path.exists(FEATURES_PATH):
        print(f"[gnn_model] {FEATURES_PATH} not found - check your Elliptic extraction path")
        return

    data, extra = load_elliptic_as_pyg_data()
    time_steps = extra["time_steps"]

    # Temporal split per Elliptic's own recommended convention: 49 total
    # time steps, first ~34 for train, rest for test - avoids the
    # "future leaking into past" issue a random split risks.
    labeled_mask = data.y != -1
    train_mask = labeled_mask & (time_steps <= 34)
    test_mask = labeled_mask & (time_steps > 34)

    print(f"[gnn_model] train: {train_mask.sum().item()} labeled nodes (time_step <= 34)")
    print(f"[gnn_model] test:  {test_mask.sum().item()} labeled nodes (time_step > 34)")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[gnn_model] using device: {device}")

    model = GraphSAGE(in_channels=data.x.shape[1], hidden_channels=HIDDEN_DIM).to(device)
    data = data.to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE, weight_decay=5e-4)

    # class imbalance handling - illicit is the minority class
    n_pos = (data.y[train_mask] == 1).sum().item()
    n_neg = (data.y[train_mask] == 0).sum().item()
    class_weights = torch.tensor([1.0, n_neg / max(n_pos, 1)], dtype=torch.float).to(device)

    print(f"[gnn_model] training for {EPOCHS} epochs...")
    model.train()
    for epoch in range(EPOCHS):
        optimizer.zero_grad()
        out = model(data.x, data.edge_index)
        loss = F.cross_entropy(out[train_mask], data.y[train_mask], weight=class_weights)
        loss.backward()
        optimizer.step()

        if (epoch + 1) % 20 == 0:
            print(f"  epoch {epoch + 1}/{EPOCHS}, loss: {loss.item():.4f}")

    # --- evaluation on the temporal held-out test set ---
    model.eval()
    with torch.no_grad():
        out = model(data.x, data.edge_index)
        probs = F.softmax(out, dim=1)[:, 1]
        preds = out.argmax(dim=1)

    y_true = data.y[test_mask].cpu().numpy()
    y_pred = preds[test_mask].cpu().numpy()
    y_proba = probs[test_mask].cpu().numpy()

    print("\n[gnn_model] === Test set evaluation (temporal split, time_step > 34) ===")
    print(f"  Accuracy:  {accuracy_score(y_true, y_pred):.4f}")
    print(f"  Precision: {precision_score(y_true, y_pred, zero_division=0):.4f}")
    print(f"  Recall:    {recall_score(y_true, y_pred, zero_division=0):.4f}")
    print(f"  F1:        {f1_score(y_true, y_pred, zero_division=0):.4f}")
    try:
        print(f"  ROC-AUC:   {roc_auc_score(y_true, y_proba):.4f}")
    except ValueError:
        pass

    os.makedirs(os.path.dirname(MODEL_OUTPUT_PATH), exist_ok=True)
    torch.save(model.state_dict(), MODEL_OUTPUT_PATH)
    print(f"\n[gnn_model] saved model to {MODEL_OUTPUT_PATH}")
    print("[gnn_model] NOTE: this model is trained/evaluated entirely on Elliptic's "
          "academic benchmark - it is NOT wired into apply_scoring.py or the live "
          "Bitcoin adapter, since Elliptic's anonymized txIds can't map to real "
          "addresses. Positioned as a standalone technique demonstration.")


if __name__ == "__main__":
    main()