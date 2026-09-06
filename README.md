# NodeHound

NodeHound is an advanced multi-chain blockchain forensics, fund-flow tracing, and illicit typology detection platform.

## Project Structure

```text
NodeHound/
├── backend/          # FastAPI backend, NetworkX graph engine, ML models, intelligence
│   ├── alerts/       # Rule-based and model alert generation
│   ├── api/          # FastAPI routes and schemas (/trace, /health, /node, /timeline)
│   ├── clustering/   # Bitcoin/UTXO heuristic clustering
│   ├── data/         # Offline traces, labels (Etherscan, OFAC, GraphSense, Tron)
│   ├── graph/        # Graph construction, labeling, and community detection
│   ├── ingestion/    # Multi-chain data adapters (Ethereum, Tron, Bitcoin)
│   ├── intelligence/ # VASP, attribution, and mixer intelligence
│   ├── reports/      # Markdown & forensic report generators
│   ├── scoring/      # Behavioral features and risk scoring models
│   ├── scripts/      # Model training and dataset generation scripts
│   └── tests/        # Backend test suite
│
├── frontend/         # React 19 + Vite investigator interface (18 modules)
│   ├── src/
│   │   ├── components/ # Common badges, visualizers, and 18 investigator views
│   │   ├── context/    # Global InvestigationContext (deep-linking & trace state)
│   │   └── utils/      # Client-side deterministic behavioral feature engine
│   └── vite.config.js  # Proxies /health, /trace, /node/, /timeline/ to backend:8080
│
└── docker-compose.yml # Optional Neo4j graph database service
```

## Running the Application

### 1. Backend
Navigate to the `backend/` directory:
```powershell
cd backend
py -m pip install -r requirements.txt
py -m uvicorn api.main:app --port 8080
```
Backend API will be running on `http://127.0.0.1:8080` (`/docs` for Swagger API specification).

### 2. Frontend
In a separate terminal, navigate to the `frontend/` directory:
```powershell
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.
