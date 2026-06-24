# FIFA World Cup 26 — Standings & Bracket Predictor

A small personal project: a two-page static website for the **2026 FIFA World Cup**
(the first 48-team, 12-group edition co-hosted by the USA, Canada & Mexico).

- **Page 1 — Standings:** live group tables for all 12 groups, plus the third-place
  race that decides which 8 of the 12 third-placed teams advance.
- **Page 2 — Bracket Predictor:** drag teams to set your own group finishes, choose
  which third-placed teams qualify, then click through the knockout rounds
  (Round of 32 → Final) to predict a champion.

It's plain **HTML + CSS + vanilla JavaScript** — no framework, no build step, no backend,
no API key. Predictions are saved in your browser's `localStorage`.

---

## Running locally

It's a static site, but the live-standings fetch needs an `http://` origin (opening the
file directly as `file://` is blocked by the browser), so serve it with any static server.

**Spin up** (from the project folder):

bash
python3 -m http.server 8765


Then open:

- Standings → <http://localhost:8765/index.html>
- Bracket predictor → <http://localhost:8765/bracket.html>

**Shut down:**

- Press **`Ctrl + C`** in the terminal running the server, **or**
- from any terminal: `lsof -ti:8765 | xargs kill`

> Any static server works — `npx serve .`, the VS Code "Live Server" extension, etc.
> Node.js is **not** required to run the site (it's only used for developing/testing the
> bracket logic).

---

## What it does

### Page 1 — Standings (`index.html`)

- All **12 group tables** (A–L) with flag, team, Played, W, D, L, Goals For, Goals
  Against, Goal Difference, and Points.
- A **third-place master table** ranking all 12 group-third teams by
  **Points → Goal Difference → Goals For**, highlighting the **top 8** that qualify
  for the Round of 32.
- A **Refresh** button that re-syncs the latest results live from the public API
  (see below). The last good snapshot is cached, so the page still shows data if
  you're offline.

### Page 2 — Bracket Predictor (`bracket.html`)

A two-step "predict the knockouts" game:

**Step 1 — Set your groups**
- **Drag any team** to reorder it within its group (1st → 4th). Dragging is locked to
  within a group — you can't move a team to a different group.
- Each group's **third-placed team has a "Qualify" checkbox**. Tick exactly **8** of the
  12 to choose which third-placed teams advance. A counter tracks `3rd-place: N / 8`.
- Pre-seeded from the live standings, with the current best-8 thirds already ticked, so
  you start from reality and tweak from there.

**Step 2 — Pick winners**
- The **Round of 32 auto-fills** from your group orderings using the official FIFA match
  structure (matches 73–104). Slots that depend on an unselected third show a placeholder
  label (e.g. *"3rd E/H/I/J/K"*) until they can be resolved.
- **Click a team** in any tie to advance it. Winners **propagate instantly** through the
  Round of 16, Quarter-finals, Semi-finals, and Final, ending in a **Champion** card.
- Changing an earlier-round pick automatically clears any now-invalid downstream picks.
- Everything **saves automatically** to `localStorage` — reload and your bracket is still
  there. **Reset predictions** clears and re-seeds from the latest standings.

---

## How accurate is the bracket? (the third-place allocation)

The genuinely tricky part of a 48-team World Cup bracket is **which Round-of-32 match each
third-placed team goes into** — it isn't a simple rule. FIFA pre-published a fixed lookup
of all **495 possible combinations** (which 8 groups send a third-placed team through) in
**Annex C** of the tournament regulations.

This project uses that **official table**, stored in `wc-thirds-official.js`. It was
extracted from the published source and validated end-to-end:

- All **495 rows** present and numbered 1–495.
- Every row's assignment is a valid permutation of its qualifying groups, with each team
  placed only in a match it's actually eligible for.
- Verified across **all 495 combinations** to produce a valid Round of 32 with **no team
  ever facing a side from its own group**.

So once you've selected exactly 8 third-placed teams, the Round-of-32 third-place slots
fill **identically to FIFA's official allocation**. (If fewer than 8 are selected, a
fallback fills what it can for the live preview.)

The bracket *structure* itself (which group winner/runner-up meets whom, and how rounds
connect) follows the official FIFA schedule for matches 73–104.

---

## Data source (standings API)

Live standings come from **ESPN's public soccer API** — **no API key or signup required**:


https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings


It returns JSON for all 12 groups and sends permissive CORS headers
(`access-control-allow-origin: *`), so the browser can fetch it directly from any origin.

> Note: this is an undocumented/unofficial public endpoint. It's stable and great for a
> small personal project, but it isn't guaranteed by ESPN and could change. The app caches
> the last successful response and degrades gracefully if the request fails.

---

## Hosting for free (GitHub Pages)

Because it's a static site, you can host it free on **GitHub Pages** (or Netlify, Vercel,
Cloudflare Pages — all work the same way). On GitHub Pages:

1. Create a new repository and add these files:
   `index.html`, `bracket.html`, `theme.css`, `bracket.css`, `wc-data.js`,
   `wc-bracket.js`, `wc-thirds-official.js`, `bracket-ui.js`, and the background image
   `gkrlldkogwgdtya3atef.jpg`.
2. Go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, select your `main` branch and the
   `/ (root)` folder, then **Save**.
4. After a minute, your site is live at
   `https://<your-username>.github.io/<repo-name>/` (it opens `index.html` by default).

The live standings work on the deployed site for the same CORS reason as above — no
server-side code or configuration needed. All internal links/assets use relative paths,
so it works whether served from a root domain or a `/repo-name/` subpath.

---

## Project structure


index.html              Standings page
bracket.html            Bracket predictor page
theme.css               Shared dark World Cup theme
bracket.css             Predictor-specific styles
wc-data.js              Shared data layer (fetch, parse, flags, cache)
wc-bracket.js           Knockout bracket engine (match graph + resolution)
wc-thirds-official.js   Official FIFA Annex C third-place lookup (495 rows)
bracket-ui.js           Predictor UI (drag, checkboxes, bracket rendering)
gkrlldkogwgdtya3atef.jpg  Background image


**Third-party (loaded at runtime via CDN — nothing to install):**
- [SortableJS](https://github.com/SortableJS/Sortable) 1.15.6 — drag-to-reorder
- [Google Fonts: Inter](https://fonts.google.com/specimen/Inter) — typeface

---

## Notes & caveats

- **Flag emojis are OS-dependent.** They render fully on macOS/iOS (including the England
  and Scotland flags). On **Windows**, regional-indicator flag emojis generally don't
  render, so you'll see country abbreviations instead. Cosmetic only.
- **Standings update only when matches finish** — hit **Refresh** after a match.
- This is an **unofficial fan project**, not affiliated with FIFA or ESPN.