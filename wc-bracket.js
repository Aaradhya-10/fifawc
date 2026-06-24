/* ============================================================
   wc-bracket.js — knockout bracket engine (no UI)
   Pure logic: resolves the R32→Final bracket from
   (group positions + which 3rd-place groups qualify + winner picks).
   Verified structure: matches 73–104, FIFA 2026.
   Works in browser (window.WCB) and Node (module.exports) for testing.
   ============================================================ */
(function (root) {
  "use strict";

  // ---- Round of 32 third-place slot eligibility (FIFA Annex sets) ----
  const ELIG = {
    S74: "ABCDF", S77: "CDFGH", S79: "CEFHI", S80: "EHIJK",
    S81: "BEFIJ", S82: "AEHIJ", S85: "EFGIJ", S87: "DEIJL",
  };

  // ---- Match graph. a/b describe each slot's source. ----
  // {t:'W'|'RU', g}        -> group winner / runner-up
  // {t:'3', slot}          -> a qualified third-placed team (assigned by matching)
  // {t:'win'|'lose', m}    -> winner/loser of an earlier match
  const M = (round, a, b) => ({ round, a, b });
  const MATCHES = {
    73: M("R32", { t: "RU", g: "A" }, { t: "RU", g: "B" }),
    74: M("R32", { t: "W", g: "E" }, { t: "3", slot: "S74" }),
    75: M("R32", { t: "W", g: "F" }, { t: "RU", g: "C" }),
    76: M("R32", { t: "W", g: "C" }, { t: "RU", g: "F" }),
    77: M("R32", { t: "W", g: "I" }, { t: "3", slot: "S77" }),
    78: M("R32", { t: "RU", g: "E" }, { t: "RU", g: "I" }),
    79: M("R32", { t: "W", g: "A" }, { t: "3", slot: "S79" }),
    80: M("R32", { t: "W", g: "L" }, { t: "3", slot: "S80" }),
    81: M("R32", { t: "W", g: "D" }, { t: "3", slot: "S81" }),
    82: M("R32", { t: "W", g: "G" }, { t: "3", slot: "S82" }),
    83: M("R32", { t: "RU", g: "K" }, { t: "RU", g: "L" }),
    84: M("R32", { t: "W", g: "H" }, { t: "RU", g: "J" }),
    85: M("R32", { t: "W", g: "B" }, { t: "3", slot: "S85" }),
    86: M("R32", { t: "W", g: "J" }, { t: "RU", g: "H" }),
    87: M("R32", { t: "W", g: "K" }, { t: "3", slot: "S87" }),
    88: M("R32", { t: "RU", g: "D" }, { t: "RU", g: "G" }),

    89: M("R16", { t: "win", m: 74 }, { t: "win", m: 77 }),
    90: M("R16", { t: "win", m: 73 }, { t: "win", m: 75 }),
    91: M("R16", { t: "win", m: 76 }, { t: "win", m: 78 }),
    92: M("R16", { t: "win", m: 79 }, { t: "win", m: 80 }),
    93: M("R16", { t: "win", m: 83 }, { t: "win", m: 84 }),
    94: M("R16", { t: "win", m: 81 }, { t: "win", m: 82 }),
    95: M("R16", { t: "win", m: 86 }, { t: "win", m: 88 }),
    96: M("R16", { t: "win", m: 85 }, { t: "win", m: 87 }),

    97: M("QF", { t: "win", m: 89 }, { t: "win", m: 90 }),
    98: M("QF", { t: "win", m: 93 }, { t: "win", m: 94 }),
    99: M("QF", { t: "win", m: 91 }, { t: "win", m: 92 }),
    100: M("QF", { t: "win", m: 95 }, { t: "win", m: 96 }),

    101: M("SF", { t: "win", m: 97 }, { t: "win", m: 98 }),
    102: M("SF", { t: "win", m: 99 }, { t: "win", m: 100 }),

    103: M("3RD", { t: "lose", m: 101 }, { t: "lose", m: 102 }),
    104: M("FINAL", { t: "win", m: 101 }, { t: "win", m: 102 }),
  };

  const ROUNDS = [
    { key: "R32", label: "Round of 32", ids: [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88] },
    { key: "R16", label: "Round of 16", ids: [89,90,91,92,93,94,95,96] },
    { key: "QF", label: "Quarter-finals", ids: [97,98,99,100] },
    { key: "SF", label: "Semi-finals", ids: [101,102] },
    { key: "FINAL", label: "Final", ids: [104] },
  ];

  const eligLabel = (slot) => ELIG[slot].split("").join("/");

  // ---- Assign qualifying 3rd-place groups to the 8 slots ----
  // Kuhn's max bipartite matching, most-constrained-first for stable output.
  // Returns { groupBySlot: {S74:'C',...}, slotByGroup: {C:'S74',...}, official:bool }.
  //
  // When EXACTLY 8 groups are selected and the official Annex C lookup table
  // (wc-thirds-official.js) is loaded, use the real FIFA assignment for that
  // combination. Otherwise (partial selection, or table not loaded) fall back
  // to a rematch-free bipartite matching so the preview still fills slots.
  function assignThirds(checkedGroups) {
    const OFFICIAL =
      (typeof WC_THIRDS_OFFICIAL !== "undefined" && WC_THIRDS_OFFICIAL) ||
      (typeof root !== "undefined" && root.WC_THIRDS_OFFICIAL) || null;

    if (OFFICIAL && checkedGroups.length === 8) {
      const key = checkedGroups.slice().sort().join("");
      const row = OFFICIAL[key];
      if (row) {
        const groupBySlot = {};
        const slotByGroup = {};
        for (const s of Object.keys(row)) {
          groupBySlot[s] = row[s];
          slotByGroup[row[s]] = s;
        }
        return { groupBySlot, slotByGroup, official: true };
      }
    }

    // ---- fallback: Kuhn's matching (partial selection / no table) ----
    const slots = Object.keys(ELIG);
    const groupBySlot = {};
    const slotByGroup = {};
    function tryAssign(g, visited) {
      for (const s of slots) {
        if (ELIG[s].indexOf(g) !== -1 && !visited.has(s)) {
          visited.add(s);
          if (!(s in groupBySlot) || tryAssign(groupBySlot[s], visited)) {
            groupBySlot[s] = g;
            slotByGroup[g] = s;
            return true;
          }
        }
      }
      return false;
    }
    const degree = (g) => slots.filter((s) => ELIG[s].indexOf(g) !== -1).length;
    const order = checkedGroups.slice().sort((a, b) => degree(a) - degree(b) || a.localeCompare(b));
    for (const g of order) {
      // recompute from scratch each time is unnecessary; Kuhn handles incrementally
      if (!(g in slotByGroup)) tryAssign(g, new Set());
    }
    return { groupBySlot, slotByGroup, official: false };
  }

  // ---- Resolve the whole bracket ----
  // state = { positions:{A:[t,t,t,t],...}, thirdsChecked:[...groups], picks:{m:abbr|null} }
  // Returns { matches:{ id:{home,away,homeLabel,awayLabel,winner,loser} }, groupBySlot, staleCleared:[] }
  function resolve(state) {
    const positions = state.positions || {};
    const checked = (state.thirdsChecked || []).slice();
    const picks = state.picks || {};
    const { groupBySlot } = assignThirds(checked);

    const out = {};
    const staleCleared = [];

    const posTeam = (g, idx, extra) => {
      const arr = positions[g];
      if (!arr || !arr[idx]) return null;
      return Object.assign({}, arr[idx], { group: g, pos: idx + 1 }, extra || {});
    };

    function teamOf(src) {
      if (!src) return { team: null, label: "?" };
      if (src.t === "W") return { team: posTeam(src.g, 0), label: "Winner " + src.g };
      if (src.t === "RU") return { team: posTeam(src.g, 1), label: "Runner-up " + src.g };
      if (src.t === "3") {
        const g = groupBySlot[src.slot];
        return {
          team: g ? posTeam(g, 2, { slotLabel: src.slot }) : null,
          label: "3rd " + eligLabel(src.slot),
        };
      }
      // win / lose of an earlier match
      const prev = out[src.m];
      const labelPrefix = src.t === "win" ? "Winner" : "Loser";
      if (!prev) return { team: null, label: labelPrefix + " M" + src.m };
      const team = src.t === "win" ? prev.winner : prev.loser;
      return { team, label: labelPrefix + " M" + src.m };
    }

    const ids = Object.keys(MATCHES).map(Number).sort((a, b) => a - b);
    for (const id of ids) {
      const def = MATCHES[id];
      const A = teamOf(def.a);
      const B = teamOf(def.b);
      const home = A.team, away = B.team;

      // Determine winner from the stored pick (by abbr). Stale picks self-clear.
      let winner = null, loser = null;
      const pick = picks[id];
      if (home && away && pick) {
        if (pick === home.abbr) { winner = home; loser = away; }
        else if (pick === away.abbr) { winner = away; loser = home; }
        else { staleCleared.push(id); } // pick no longer matches either side
      } else if (pick && (!home || !away)) {
        staleCleared.push(id); // a participant disappeared
      }

      out[id] = {
        id, round: def.round,
        home, away,
        homeLabel: A.label, awayLabel: B.label,
        winner, loser,
        pick: winner ? winner.abbr : null,
      };
    }
    return { matches: out, groupBySlot, staleCleared };
  }

  const API = { ELIG, MATCHES, ROUNDS, eligLabel, assignThirds, resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.WCB = API;
})(typeof window !== "undefined" ? window : globalThis);