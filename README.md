# ScanScorecards

Golf scorecard app that scans physical scorecards and tracks rounds, courses, and player stats.

## Running the App

You need two terminals running at the same time.

### Terminal 1 — Backend

```bash
cd golf_scorecard_app/ScanScorecards
source .venv/bin/activate
uvicorn api.main:app --reload
```

Runs on http://localhost:8000

### Terminal 2 — Frontend

```bash
cd frontend
npm install   # first time only
npm run dev
```

Runs on http://localhost:5173

Open http://localhost:5173 in your browser. The frontend proxies API requests to the backend automatically.
