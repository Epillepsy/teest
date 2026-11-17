# Stride — personal running dashboard (PWA)

A Strava-like running dashboard with no social features, no account and no backend.
Import your FIT/TCX files and everything stays on your device in IndexedDB.

**Stack:** Vue 3 · Vite · TypeScript · Pinia · Vue Router · vite-plugin-pwa · Dexie · `@garmin/fitsdk` · DOMParser (TCX) · uPlot · Leaflet · Vitest

## Features

- **Import** `.fit`, `.tcx` and `.gpx` files, each optionally `.gz`-compressed.
- **Bulk import:**
  - **Whole archives:** pick a `.zip`, such as Strava's *Download your data* export (Settings → My Account → Download or Delete Your Account). The archive is read lazily: only the central directory is loaded, then one activity at a time, so multi-GB exports work on a phone. ZIP64 archives are supported.
  - **Strava `activities.csv`:** if the archive or folder includes it, runs get their Strava names, and rides, walks and other non-runs are skipped without being decompressed.
  - **Folders and drag-and-drop:** a **Folder…** button on desktop and Android (not iOS, which doesn't support picking folders). On desktop you can also drop files, folders or a zip anywhere in the app.
  - **Progress and cancel:** activities are saved every 20 files. The import shows live counts (new, duplicate, skipped, failed) and can be cancelled; runs already imported are kept. Re-importing the same archive just reports duplicates.
  - **Duplicates:** a file is skipped when its start time and its duration are each within 5 s of a run you already have, or of another file in the same import.
  - **Non-runs:** activities that are clearly not runs (cycling, swimming, walking, hiking…) are skipped.
- **Runs list**, grouped by month, with search and a "races only" filter.
- **Activity page:** route map, km splits (pace, HR, elevation), pace/HR/elevation charts with the cursor shown on the map, best efforts, rename, mark as race, delete.
- **Dashboard:** totals for the week, month and year; 4-week average; distance per week or month for the last 12 periods (with a table view); goal summary; recent runs.
- **Insights**
  - **PRs:** the fastest 400 m, 1 km, 1 mile, 5K, 10K, half and marathon segment inside any run (all time, 12 months or 90 days).
  - **Race predictor:** Riegel and Daniels VDOT from your strongest recent efforts, with a ~80 % confidence range.
  - **Training paces** (E/M/T/I) from your current VDOT.
  - **Fitness and load:** Banister TRIMP, with CTL (42 d), ATL (7 d) and TSB.
  - **Goal feasibility:** your probability of hitting a target time on a date. The default is sub-55:00 10K on 15 Nov 2026; change it in Settings.
- **Training plan:** a Plan tab with week cards, sessions to tick off, actual km and notes, a pace table, quality sessions and rules. Imported runs tick the matching session automatically: the same day or one day off, at 0.4–2× the planned km. Manual ticks and km override the match. Update the plan by importing a plan file (see below) instead of rebuilding the app.
- **Backup:** export everything (runs, samples, settings, the imported plan and plan progress) to JSON and restore with merge and dedupe. On phones the export goes through the share sheet, so you can save it to iCloud Drive or Google Drive.
- **Offline:** an installable PWA. The app shell is precached, and map tiles you have viewed are cached.

## Plan file format

**Plan → Import plan…** takes a JSON file in this format and replaces the current plan. The plan artifact's **Download for Stride** button produces one. Ticks, km and notes are kept, because they are keyed by session `id` and week `n`. Keep ids stable when you revise a plan (e.g. `w9-q` stays the Friday session of week 9). **Use built-in plan** goes back to the plan shipped with the app.

A minimal two-week example:

```json
{
  "format": "stride-plan",
  "version": 1,
  "id": "my-10k-2027",
  "title": "Spring 10 km · Sunday 21 March 2027",
  "subtitle": "Goal: sub 55",
  "raceDate": "2027-03-21",
  "paces": [
    { "effort": "Easy", "pace": "6:45–7:15", "hr": "≤ 145", "cadence": "165–170" },
    { "effort": "Goal 10k", "pace": "5:30", "hr": "—", "cadence": "—" }
  ],
  "paceNote": "Paces are provisional until the 5k time trial.",
  "quality": [
    { "label": "Q1", "title": "8 × 1 min at 5:10, 1:30 easy between", "note": "Fast but relaxed.", "week": 2, "date": "2026-11-27" }
  ],
  "rules": [
    { "title": "Weekly layout", "items": ["Monday: long run.", "Wednesday: footing.", "Friday: quality session."] }
  ],
  "weeks": [
    {
      "n": 1, "block": "Rest", "kind": "rest", "start": "2026-11-16", "end": "2026-11-22",
      "sessions": [
        { "id": "w1-rest", "date": "", "day": "All week", "type": "rest", "name": "Full rest", "detail": "No running.", "km": 0 }
      ]
    },
    {
      "n": 2, "block": "Base", "kind": "build", "start": "2026-11-23", "end": "2026-11-29", "gym": "Deload",
      "sessions": [
        { "id": "w2-long", "date": "2026-11-23", "day": "Mon 23 Nov", "type": "long", "name": "Long run", "detail": "Easy, conversational.", "km": 7 },
        { "id": "w2-foot", "date": "2026-11-25", "day": "Wed 25 Nov", "type": "footing", "name": "Footing", "detail": "Easy.", "km": 5 },
        { "id": "w2-q", "date": "2026-11-27", "day": "Fri 27 Nov", "type": "quality", "name": "Q1 · 8 × 1 min at 5:10", "detail": "About 5 km with warm-up and cooldown.", "km": 5 }
      ]
    }
  ]
}
```

| Field | Notes |
|---|---|
| `format`, `version` | Always `"stride-plan"` and `1`. |
| `raceDate`, `start`, `end`, `date` | Local dates, `YYYY-MM-DD`. A session `date` may be `""` for an all-week entry such as a rest week. Weeks must be in order. |
| `kind` (week) | `build`, `rest`, `deload` or `test`. Optional; defaults to `build`. |
| `type` (session) | `rest`, `long`, `footing`, `quality`, `test` or `race`. |
| `km` | Planned km, `0` for rest. Sessions with a date and `km > 0` are auto-matched to imported runs. |
| `day` | The label shown before the session name. |
| `gym`, `subtitle`, `detail`, `paces`, `paceNote`, `quality`, `rules` | Optional, for display only. |

## Prediction math (`src/lib/predict`, all unit-tested)

| Module | What it does |
|---|---|
| `riegel.ts` | `T₂ = T₁·(D₂/D₁)^1.06`, plus fitting a personal exponent |
| `vdot.ts` | Daniels–Gilbert VO₂ cost and %VO₂max curves, VDOT ⇄ race time by bisection, training paces. Checked against the published VDOT 50 table. |
| `predictor.ts` | Takes the best effort from each run inside the window, drops efforts more than 5 % below your best VDOT (easy runs), and keeps the top 3. It blends Riegel and VDOT as a weighted geometric mean, weighted by recency (45-day half-life), distance proximity and the race flag. The log-σ combines how much the sources disagree, an extrapolation term, a floor, and a penalty when there are few sources. The fast side of the range is wider when no runs are marked as races. |
| `load.ts` | Banister TRIMP. Without HR it estimates intensity from pace vs threshold. EWMA fitness, fatigue and form. |
| `goal.ts` | Projects today's prediction to race day with compounding weekly improvement. The rate comes from the CTL ramp and is capped at 5 % total. Race time is treated as log-normal to give P(time < goal) and a verdict. |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # type-check + production build to dist/
```

## Deploy to Cloudflare

The app is deployed as a static-assets-only Cloudflare Worker, configured in `wrangler.jsonc`.

1. In Cloudflare, go to Workers & Pages → Create → Import a repository, and pick this repo.
2. Build command: `pnpm run build` (or `npm run build`). Deploy command: `npx wrangler deploy`.
3. `wrangler.jsonc` uploads `dist/`. Its `"not_found_handling": "single-page-application"` setting serves `index.html` for unknown paths, so deep links like `/runs/<id>` load on refresh. Workers rejects the Pages-style `/* /index.html 200` redirect, which is why there is no `_redirects` file.
4. `public/_headers` makes `sw.js` revalidate, so updates show up, and gives hashed assets immutable caching.

## Install on your phone

Open the deployed URL. On iOS, open it in Safari, tap Share, then "Add to Home Screen". On Android, use Chrome's ⋮ menu and choose "Install app".
After an update, a "new version available" banner appears.

> Your data lives only in that browser's storage. Export a backup now and then. On iOS, the home-screen app has its own storage, separate from Safari tabs.
