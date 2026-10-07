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
- **Backup:** export everything (runs, samples and settings) to JSON and restore with merge and dedupe. On phones the export goes through the share sheet, so you can save it to iCloud Drive or Google Drive.
- **Offline:** an installable PWA. The app shell is precached, and map tiles you have viewed are cached.

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

## Deploy to Cloudflare Pages

1. In Cloudflare, go to Workers & Pages → Create → Pages → Connect to Git, and pick this repo.
2. Build command: `npm run build`. Output directory: `dist`. Set the environment variable `NODE_VERSION=22`.
3. `public/_redirects` handles the SPA fallback. `public/_headers` makes `sw.js` and `index.html` revalidate, so updates show up, and gives hashed assets immutable caching.

## Install on your phone

Open the Pages URL. On iOS, open it in Safari, tap Share, then "Add to Home Screen". On Android, use Chrome's ⋮ menu and choose "Install app".
After an update, a "new version available" banner appears.

> Your data lives only in that browser's storage. Export a backup now and then. On iOS, the home-screen app has its own storage, separate from Safari tabs.
