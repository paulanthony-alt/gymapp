# Lift — offline workout tracker

A mobile-first, offline-first workout tracker for a 5-day hypertrophy program.
Plain HTML/CSS/vanilla JS. No backend, no build step, no frameworks, no npm.
All data lives in your phone's `localStorage`.

## Features

- **Today** — shows the next workout day (based on what you last finished), tap a chip to override. Lists each exercise with target sets/reps and what you lifted last time. Double-progression prompts appear here.
- **Active Session** — one exercise at a time with prev/next + jump list. Big +/- steppers for weight (±5) and reps (±1) so you never open the keyboard. Ghost text pre-fills last session's numbers — tap **Log Set** without editing to repeat. Logging auto-starts a rest timer (150/90/60s per exercise) with +30s / skip and vibrate on finish. Per-exercise notes, add extra sets or unplanned exercises.
- **Progress** — per-exercise estimated-1RM line chart (Epley, top set per session) drawn with inline SVG, plus heaviest-weight and best-1RM personal bests. Bodyweight log with a 7-day rolling-average line and a color-coded weekly rate of change (green in the +0.25…+0.75 lb/wk band, targeting +0.5).
- **History** — reverse-chronological sessions; tap to expand every set; edit or delete.
- **Settings** — export/import JSON backups, training-week counter, erase data.

Data is written to `localStorage` after **every single set**, and the in-progress
session survives an accidental reload.

## Progression logic

Double progression on a per-exercise rep range:

- Hit the **top** of the range on every work set → next time: *"Add 5 lb…"* (+5 upper, +10 lower).
- Miss the **bottom** of the range two sessions in a row → *"Stalled 2 sessions — hold or deload 10%."*
- Training-week counter increments each time you finish Day 5. Weeks 7 & 8 show a dismissible **deload** banner. Adjust or reset the counter in Settings.

## Editing the program

All exercises, sets, rep ranges, rest times, and upper/lower flags live in
[`program.js`](program.js) as a plain data structure. Edit that file directly —
no app logic to touch.

## Run it

Just open `index.html` — but a service worker and the manifest need `http(s)`,
so serve the folder rather than opening the file directly.

Any static server works, e.g.:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Deploy on GitHub Pages

All asset paths are **relative** (no leading `/`), so it works from a project
page subpath.

1. Push these files to the repo (root of `main`).
2. Repo **Settings → Pages** → Source: *Deploy from a branch* → branch `main`, folder `/ (root)`.
3. Open the published URL on your phone.

## Add to your phone's home screen

1. Open the site in the phone browser.
2. **iOS Safari:** Share → *Add to Home Screen*. **Android Chrome:** menu → *Add to Home screen / Install app*.
3. Launch from the icon — it opens fullscreen with no browser chrome and works offline after the first visit.

## Back up your data

Everything is on-device only. Use **Settings → Export** regularly to download a
JSON backup; **Import** restores it (after a confirm) on any device.
