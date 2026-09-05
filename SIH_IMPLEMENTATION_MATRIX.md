# SIH 2026 implementation matrix

Status is based on executable behavior in this repository, not on filenames alone.

| FEATURE | CURRENT STATUS | FILES | MISSING WORK | PRIORITY |
|---|---|---|---|---|
| Real-time wallet ingestion | Partial: live adapters exist for Ethereum, Bitcoin, and TRON | `ingestion/*_adapter.py`, `api/main.py` | Production indexers, retries, queues, and freshness guarantees | P2 |
| Multi-chain tracing | Implemented for the three adapters | `ingestion/*_adapter.py`, `api/main.py` | Operational provider failover | P0 |
| Multi-hop transaction graph | Implemented with bounded hop traversal | `ingestion/*_adapter.py`, `api/main.py`, `graph/schema.py` | Persistent traversal store for scale | P0 |
| Nearest exchange/VASP identification | Implemented for labelled VASPs observed in trace | `intelligence/vasp_identifier.py` | Larger verified registry and entity resolution | P0 |
| Exchange/VASP wallet clustering | Partial: Bitcoin common-input and Ethereum clustering modules exist; not unified in API | `clustering/*` | Wire Ethereum/TRON clustering and verified registry clusters | P1 |
| Intermediary/burner detection | Partial: intermediary forwarding pattern is executable | `intelligence/laundering_detector.py` | Calibrated burner typology using validated data | P0 |
| Layering/laundering detection | Partial: multi-hop and forwarding evidence patterns | `intelligence/laundering_detector.py` | More typologies and validation corpus | P0 |
| Mixer/tumbler detection | Partial: known mixer labels are detected | `intelligence/mixer_detector.py` | Verified mixer registry and behavior model | P1 |
| Bridge/cross-chain movement | Integration-ready exact-identifier correlation only | `intelligence/cross_chain.py`, `graph/bridge_correlation.py` | Observed bridge datasets and correlation rules | P0 |
| AI/ML behavioral risk scoring | Ethereum implementation plus chain-specific trainer/API path | `scoring/features.py`, `scoring/train_chain_models.py`, `api/main.py` | Real per-chain labelled graph tables and trained artifacts | P0 |
| SHAP explainability | Implemented when a compatible trained model exists | `scoring/explainability.py`, `api/main.py` | Generate explanations after real model training | P0 |
| Risk categorization | Implemented as evidence/risk category in investigation output | `api/main.py`, `reports/investigation_report.py` | Policy review of thresholds | P0 |
| Automated recommendations | Implemented as evidence-linked deterministic recommendations | `intelligence/recommendations.py` | Agency-specific playbooks | P0 |
| Automated alerts | Implemented as deterministic trace alerts | `alerts/alert_engine.py` | Delivery channels and persistence | P1 |
| Standardized investigation report | Implemented as structured report payload | `reports/investigation_report.py`, `api/main.py` | PDF/case-management renderer | P1 |
| Evidence preservation/provenance | Implemented for response evidence and integrity hash | `reports/investigation_report.py`, `api/main.py` | Immutable external evidence store and signatures | P1 |
| SAHYOG-compatible export | Payload adapter ready; no endpoint configured | `integrations/sahyog_adapter.py` | Confirmed schema, auth, and transmission endpoint | P2 |
| NCRP/LEA integration-ready API | Case adapter ready; no agency endpoint configured | `integrations/ncrp_adapter.py` | Confirmed schema, auth, and transmission endpoint | P2 |
| Analytics dashboard | Existing frontend displays traces/results | `frontend/src/*` | Investigation fields, alerts, and trends UI | P2 |
| Scalable indexing architecture | Partial: adapters and Neo4j client exist | `graph/neo4j_client.py`, `ingestion/*` | Queue-based ingestion, partitioning, backfill, observability | P2 |

Behavioral risk is an estimate and is not proof of attacker ownership. Empty
external sources, missing trained artifacts, or absent second-chain traces
produce empty evidence rather than fabricated conclusions.