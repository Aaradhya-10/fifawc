/* ============================================================
   bracket-ui.js — UI wiring for the predictor page
   Renders editable groups (drag + qualify checkboxes) and the
   live knockout bracket. Persists state to localStorage.
   Depends on: Sortable, WC (wc-data.js), WCB (wc-bracket.js)
   ============================================================ */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STATE_KEY = "wc26_predictor";
  const LETTERS = "ABCDEFGHIJKL".split("");

  // -------- persisted state --------
  // { positions:{A:[team,...]}, thirdsChecked:[...], picks:{m:abbr} }
  let state = { positions: {}, thirdsChecked: [], picks: {} };

  function save() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  // Seed positions from a freshly-fetched/cached standings snapshot.
  // Keeps only the fields the bracket needs; preserves existing picks
  // unless the team set changed.
  function seedFromGroups(groups) {
    const positions = {};
    for (const g of groups) {
      positions[g.letter] = g.teams.map((t) => ({
        name: t.name, abbr: t.abbr, flag: t.flag,
        pts: t.pts, gd: t.gd, gf: t.gf,
      }));
    }
    state.positions = positions;
    // default the 8 best thirds as checked (same rule as standings page)
    const thirds = LETTERS
      .map((L) => ({ L, t: positions[L] && positions[L][2] }))
      .filter((x) => x.t);
    thirds.sort((a, b) => b.t.pts - a.t.pts || b.t.gd - a.t.gd || b.t.gf - a.t.gf || a.t.name.localeCompare(b.t.name));
    state.thirdsChecked = thirds.slice(0, 8).map((x) => x.L);
  }

  // -------- rendering: editable groups --------
  const sortables = [];

  function renderGroups() {
    const host = $("editGroups");
    // tear down previous Sortable instances before rebuilding (avoid leak/double-bind)
    while (sortables.length) {
      try { sortables.pop().destroy(); } catch (_) {}
    }
    host.innerHTML = "";

    for (const L of LETTERS) {
      const teams = state.positions[L] || [];
      const card = document.createElement("div");
      card.className = "egroup";
      card.innerHTML = `<h3>Group ${L} <span class="hint">drag to reorder</span></h3>`;
      const ul = document.createElement("ul");
      ul.className = "rows";
      ul.dataset.group = L;

      teams.forEach((t, i) => ul.appendChild(rowEl(L, t, i)));
      card.appendChild(ul);
      host.appendChild(card);

      // drag to reorder within this group only
      sortables.push(new Sortable(ul, {
        animation: 150,
        handle: ".erow",
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
        onEnd: () => commitOrder(ul),
      }));
    }
    updateCounter();
  }

  function rowEl(L, t, idx) {
    const li = document.createElement("li");
    li.className = "erow pos" + (idx + 1) + (idx === 2 && state.thirdsChecked.includes(L) ? " qualified" : "");
    li.dataset.abbr = t.abbr;

    const isThird = idx === 2;
    const checked = state.thirdsChecked.includes(L);
    li.innerHTML = `
      <span class="grip">⠿</span>
      <span class="posn">${idx + 1}</span>
      <span class="flag">${t.flag}</span>
      <span class="nm">${t.name}</span>
      <span class="pts-mini">${t.pts} pts</span>
      ${isThird ? `<span class="qual">
        <input type="checkbox" id="q-${L}" ${checked ? "checked" : ""} />
        <label for="q-${L}">Qualify</label>
      </span>` : ""}`;

    if (isThird) {
      li.querySelector("input").addEventListener("change", (e) => toggleThird(L, e.target.checked));
    }
    return li;
  }

  // Read DOM order back into state after a drag.
  function commitOrder(ul) {
    const L = ul.dataset.group;
    const byAbbr = Object.fromEntries((state.positions[L] || []).map((t) => [t.abbr, t]));
    const newOrder = Array.from(ul.querySelectorAll(".erow")).map((li) => byAbbr[li.dataset.abbr]);
    state.positions[L] = newOrder;
    save();
    // defer so Sortable finishes its own onEnd cleanup before we destroy/rebuild it
    setTimeout(() => {
      renderGroups();   // refresh position badges + which row is "3rd"
      renderBracket();  // bracket depends on positions
    }, 0);
  }

  function toggleThird(L, on) {
    const set = new Set(state.thirdsChecked);
    if (on) set.add(L); else set.delete(L);
    state.thirdsChecked = LETTERS.filter((x) => set.has(x)); // keep A..L order
    save();
    renderGroups();
    renderBracket();
  }

  function updateCounter() {
    const n = state.thirdsChecked.length;
    const el = $("counter");
    el.textContent = `3rd-place: ${n} / 8`;
    el.classList.toggle("ready", n === 8);
    el.classList.toggle("over", n > 8);

    const warn = $("warn");
    if (n !== 8) {
      warn.classList.remove("hidden");
      warn.textContent = n < 8
        ? `Select ${8 - n} more third-placed team${8 - n > 1 ? "s" : ""} to qualify (need exactly 8). The bracket fills the slots it can in the meantime.`
        : `You've selected ${n} third-placed teams — remove ${n - 8}. Exactly 8 must qualify.`;
    } else {
      warn.classList.add("hidden");
    }
  }

  // -------- rendering: bracket --------
  function renderBracket() {
    const host = $("bracket");
    const res = WCB.resolve(state);

    // self-clear any stale picks the engine flagged
    if (res.staleCleared.length) {
      for (const id of res.staleCleared) delete state.picks[id];
      save();
    }

    host.innerHTML = "";
    for (const rd of WCB.ROUNDS) {
      const col = document.createElement("div");
      col.className = "round-col" + (rd.key === "FINAL" ? " final-col" : "");
      col.innerHTML = `<div class="rhead">${rd.label}</div>`;
      for (const id of rd.ids) col.appendChild(tieEl(res.matches[id]));

      if (rd.key === "FINAL") col.appendChild(championEl(res.matches[104]));
      host.appendChild(col);
    }
  }

  function slotEl(match, side) {
    const team = side === "home" ? match.home : match.away;
    const label = side === "home" ? match.homeLabel : match.awayLabel;
    const div = document.createElement("div");

    if (!team) {
      div.className = "slot empty";
      div.innerHTML = `<input type="radio" disabled />
        <span class="flag">·</span><span class="nm">${label}</span>`;
      return div;
    }
    const isWinner = match.pick === team.abbr;
    div.className = "slot" + (isWinner ? " winner" : "");
    div.innerHTML = `
      <input type="radio" name="m${match.id}" ${isWinner ? "checked" : ""} />
      <span class="flag">${team.flag}</span>
      <span class="nm">${team.name}</span>`;
    div.addEventListener("click", () => pickWinner(match.id, team.abbr));
    return div;
  }

  function tieEl(match) {
    const t = document.createElement("div");
    t.className = "tie" + (match.pick ? " decided" : "");
    t.innerHTML = `<span class="tnum">M${match.id}</span>`;
    t.appendChild(slotEl(match, "home"));
    t.appendChild(slotEl(match, "away"));
    return t;
  }

  function championEl(finalMatch) {
    const c = document.createElement("div");
    c.className = "champion";
    const w = finalMatch && finalMatch.winner;
    c.innerHTML = w
      ? `<div class="lab">🏆 Champion</div><div class="who"><span class="flag">${w.flag}</span> ${w.name}</div>`
      : `<div class="lab">🏆 Champion</div><div class="who tbd">Pick the final to crown a winner</div>`;
    return c;
  }

  function pickWinner(matchId, abbr) {
    state.picks[matchId] = abbr;
    save();
    renderBracket(); // re-resolve so downstream rounds update immediately
  }

  // -------- sync / reset --------
  function setStatus(html) { $("status").innerHTML = html; }
  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
    catch (_) { return iso; }
  }

  async function sync() {
    const btn = $("syncBtn"), icon = $("syncIcon");
    btn.disabled = true; icon.className = "spin";
    setStatus("Loading latest standings…");
    try {
      const raw = await WC.fetchStandings();
      const groups = WC.parseStandings(raw);
      WC.saveCache(groups);
      seedFromGroups(groups);
      state.picks = {}; // positions changed; start picks fresh
      save();
      renderGroups();
      renderBracket();
      setStatus(`<span class="ok">●</span> Seeded from live standings · ${fmtTime(new Date().toISOString())}`);
    } catch (err) {
      const cached = WC.loadCache();
      if (cached) {
        seedFromGroups(cached.groups);
        state.picks = {};
        save();
        renderGroups(); renderBracket();
        setStatus(`<span class="err">●</span> Offline (${err.message}) — seeded from cached standings (${fmtTime(cached.ts)}).`);
      } else {
        setStatus(`<span class="err">●</span> Couldn't load standings: ${err.message}. Open the Standings page once, or retry.`);
      }
    } finally {
      btn.disabled = false; icon.className = "";
    }
  }

  function reset() {
    if (!confirm("Reset all winner picks and re-seed groups from the latest standings?")) return;
    state = { positions: {}, thirdsChecked: [], picks: {} };
    save();
    sync();
  }

  // -------- boot --------
  function boot() {
    $("syncBtn").addEventListener("click", sync);
    $("resetBtn").addEventListener("click", reset);

    const saved = loadSaved();
    if (saved && saved.positions && Object.keys(saved.positions).length === 12) {
      state = Object.assign({ positions: {}, thirdsChecked: [], picks: {} }, saved);
      renderGroups();
      renderBracket();
      setStatus("Loaded your saved predictions. Use “Load live standings” to re-seed from current results.");
    } else {
      // first visit: seed from shared cache if present, else fetch
      const cached = WC.loadCache();
      if (cached) {
        seedFromGroups(cached.groups);
        save();
        renderGroups();
        renderBracket();
        setStatus(`Seeded from cached standings (${fmtTime(cached.ts)}). “Load live standings” to refresh.`);
      } else {
        renderGroups();
        sync();
      }
    }
  }

  boot();
})();