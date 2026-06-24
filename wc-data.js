/* ============================================================
   wc-data.js  —  shared data layer for both pages
   - flag emoji map (keyed by ESPN 3-letter abbreviation)
   - live fetch from ESPN's public (no-key) JSON endpoint
   - parsing + group sorting + third-place ranking
   - localStorage cache (so both pages share one snapshot)
   Exposes a single global: window.WC
   ============================================================ */
(function () {
  "use strict";

  const ENDPOINT =
    "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";
  const CACHE_KEY = "wc26_cache";

  // Flag emoji per team, keyed by ESPN abbreviation (stable join key).
  // England & Scotland use subdivision tag-sequence emoji (render on macOS).
  const FLAGS = {
    MEX: "🇲🇽", CZE: "🇨🇿", KOR: "🇰🇷", RSA: "🇿🇦",
    CAN: "🇨🇦", BIH: "🇧🇦", SUI: "🇨🇭", QAT: "🇶🇦",
    BRA: "🇧🇷", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", HAI: "🇭🇹", MAR: "🇲🇦",
    PAR: "🇵🇾", TUR: "🇹🇷", AUS: "🇦🇺", USA: "🇺🇸",
    ECU: "🇪🇨", GER: "🇩🇪", CIV: "🇨🇮", CUW: "🇨🇼",
    NED: "🇳🇱", SWE: "🇸🇪", JPN: "🇯🇵", TUN: "🇹🇳",
    BEL: "🇧🇪", IRN: "🇮🇷", EGY: "🇪🇬", NZL: "🇳🇿",
    ESP: "🇪🇸", URU: "🇺🇾", KSA: "🇸🇦", CPV: "🇨🇻",
    NOR: "🇳🇴", FRA: "🇫🇷", SEN: "🇸🇳", IRQ: "🇮🇶",
    ARG: "🇦🇷", AUT: "🇦🇹", ALG: "🇩🇿", JOR: "🇯🇴",
    COL: "🇨🇴", POR: "🇵🇹", UZB: "🇺🇿", COD: "🇨🇩",
    ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", CRO: "🇭🇷", PAN: "🇵🇦", GHA: "🇬🇭",
  };

  const int = (x) => Math.round(Number(x) || 0);
  const flagFor = (abbr) => FLAGS[abbr] || "🏳️";

  // Build a stat-name -> value lookup from ESPN's stats array.
  function statsMap(entry) {
    const m = {};
    for (const s of entry.stats || []) m[s.name] = s.value;
    return m;
  }

  // Sort within a group: trust ESPN's official rank (handles head-to-head),
  // fall back to points -> goal diff -> goals for when rank is missing/early.
  function sortTeams(teams) {
    return teams.slice().sort(
      (a, b) =>
        (a.rank > 0 ? a.rank : 99) - (b.rank > 0 ? b.rank : 99) ||
        b.pts - a.pts ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.name.localeCompare(b.name)
    );
  }

  // Raw ESPN payload -> [{ name, letter, teams: [...] }] sorted by position.
  function parseStandings(raw) {
    const groups = (raw.children || []).map((g) => {
      const teams = (g.standings && g.standings.entries || []).map((e) => {
        const s = statsMap(e);
        return {
          name: e.team.displayName,
          abbr: e.team.abbreviation,
          flag: flagFor(e.team.abbreviation),
          pld: int(s.gamesPlayed),
          w: int(s.wins),
          d: int(s.ties),
          l: int(s.losses),
          gf: int(s.pointsFor),
          ga: int(s.pointsAgainst),
          gd: int(s.pointDifferential),
          pts: int(s.points),
          rank: int(s.rank),
          note: (e.note && e.note.description) || "",
          noteColor: (e.note && e.note.color) || "",
        };
      });
      return {
        name: g.name,
        letter: String(g.name).replace(/group/i, "").trim(),
        teams: sortTeams(teams),
      };
    });
    // keep groups in A..L order
    groups.sort((a, b) => a.letter.localeCompare(b.letter));
    return groups;
  }

  // The 12 third-placed teams, ranked: points -> GD -> goals for.
  // Top 8 qualify for the Round of 32.
  function rankThirdPlace(groups) {
    const thirds = groups
      .map((g) => (g.teams[2] ? Object.assign({}, g.teams[2], { group: g.letter }) : null))
      .filter((t) => t && t.name);
    thirds.sort(
      (a, b) =>
        b.pts - a.pts ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.name.localeCompare(b.name)
    );
    return thirds;
  }

  async function fetchStandings() {
    const r = await fetch(ENDPOINT, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  // --- shared snapshot cache (both pages read the same one) ---
  function saveCache(groups) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: new Date().toISOString(), groups })
      );
    } catch (_) {}
  }
  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  window.WC = {
    ENDPOINT,
    FLAGS,
    flagFor,
    fetchStandings,
    parseStandings,
    rankThirdPlace,
    saveCache,
    loadCache,
  };
})();
