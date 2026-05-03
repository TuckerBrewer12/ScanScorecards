# BirdieEyeView
[birdie-eye-view.com
](https://www.birdie-eye-view.com/)

Snap a photo of your scorecard. Get a full round breakdown, your stats over time, and personalized tips to shoot lower.

---

## What It Does

**Scan** — Take a picture of any physical scorecard after your round. The app uses an LLM to pull out your scores, course info, hole pars, and shot stats automatically. Review the extraction and fix anything before saving.

**Track** — Every round is stored with hole-by-hole detail: strokes, putts, fairways, greens in regulation. The scorecard view shows your score against par for each hole and your front/back/total.

**Analyze** — The analytics dashboard breaks down your game across all your rounds:
- Score type distribution (eagles through quad bogeys)
- GIR and putting averages
- Scoring by hole distance and par type
- Worst and best holes
- Handicap trend over time

**Improve** — Set a scoring goal (break 90, 85, 80, etc.) and the app identifies your highest-ROI improvement areas: three-putt bleed, blowup holes, weak yardage zones, GIR opportunities, and more. Each insight is ranked by how many strokes it's worth.

---

## Running the App

Two terminals.

**Terminal 1 — Backend**
```bash
source .venv/bin/activate
uvicorn api.main:app --reload
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
```

Open localhost
