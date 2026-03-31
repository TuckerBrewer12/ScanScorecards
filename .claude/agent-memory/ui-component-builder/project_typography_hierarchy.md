---
name: Typographic hierarchy — label vs data
description: Approved class conventions for label/data pairs across analytics and dashboard
type: project
---

Labels above/beside data values: `text-[10px] uppercase tracking-widest font-bold text-gray-400`
Data/stat numbers: `text-4xl font-semibold tracking-tighter text-gray-900`
Hero accent stat (HI on primary bg): `text-4xl font-semibold tracking-tighter text-white`

**Why:** Extreme contrast between tiny muted uppercase label and large bold dark number creates instant scanability — the "Apple data card" feel.

**How to apply:** Any time a numeric stat is displayed with a label, use these classes. Do NOT use `text-2xl` or `text-3xl` for primary stat numbers in KPI cards — go straight to `text-4xl`.
