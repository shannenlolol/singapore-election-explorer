const { analyseContest, groupContests } = require("../domain/electionResults");
// controllers/boundaries.controller.js

function upperTrim(v) {
  return String(v || "").trim().toUpperCase();
}

// Normalise a constituency key to match boundary naming.
// If boundary is "ALJUNIED GRC", we want summary keyed as "ALJUNIED GRC" too.
function makeConstituencyKey(constituency, constituencyType) {
  const base = String(constituency || "").trim();
  const ctype = String(constituencyType || "").trim().toUpperCase();

  if (!base) return "";

  const up = upperTrim(base);

  // If already has suffix, keep it.
  if (up.endsWith(" SMC") || up.endsWith(" GRC")) {
    return up;
  }

  // Otherwise append suffix if we know it.
  if (ctype === "SMC" || ctype === "GRC") {
    return upperTrim(`${base} ${ctype}`);
  }

  return up;
}

async function getBoundariesByYear(req, res, next) {
  try {
    const pool = req.app.locals.pool;
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) {
      res.status(400).json({ message: "year is required (number)." });
      return;
    }

    const [rows] = await pool.execute(
      `
      SELECT geojson
      FROM ge_boundaries
      WHERE year = ?
      LIMIT 1
      `,
      [year],
    );

    if (!rows || rows.length === 0) {
      res.status(404).json({
        message: `No boundaries found for year ${year}. Run sync_data_gov_sg.mjs to populate ge_boundaries.`,
      });
      return;
    }

    const raw = rows[0].geojson;
    const geojson = typeof raw === "string" ? JSON.parse(raw) : raw;

    res.json(geojson);
  } catch (e) {
    next(e);
  }
}

// GET /api/boundaries/summary?year=2025
// Returns:
// {
//   year: 2025,
//   parties: ["PAP","WP",...],
//   summary: {
//     "ALJUNIED GRC": {
//        winnerParty: "WP",
//        constituencyType: "GRC",
//        parties: { "WP": { votePct: 59.51 }, "PAP": { votePct: 40.49 } }
//     },
//     ...
//   }
// }
async function getBoundariesSummaryByYear(req, res, next) {
  try {
    const pool = req.app.locals.pool;
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) {
      res.status(400).json({ message: "year is required (number)." });
      return;
    }

    const [rows] = await pool.execute(
      `SELECT year, constituency, constituency_type, party, candidates, vote_count
       FROM ge_candidate_results WHERE year = ?`, [year],
    );
    const summary = {};
    const partySet = new Set();
    for (const contestants of groupContests(rows).values()) {
      const row = contestants[0];
      const result = analyseContest(contestants);
      const type = ["GRC", "SMC"].includes(row.constituency_type) ? row.constituency_type : null;
      const parties = {};
      for (const contestant of result.contestants) {
        const party = upperTrim(contestant.party);
        partySet.add(party);
        const share = contestant.vote_share;
        if (!parties[party]) parties[party] = { votePct: share === null ? null : 0 };
        if (share !== null) parties[party].votePct += share * 100;
      }
      // Party shares remain grouped for the map legend; winner comes from an individual/team.
      const winner = result.contestants[0];
      summary[makeConstituencyKey(row.constituency, type)] = {
        winnerParty: result.winner_party ? upperTrim(result.winner_party) : null,
        winnerVotePct: result.winner_party && winner?.vote_share != null ? winner.vote_share * 100 : null,
        outcome: result.outcome,
        constituencyType: type,
        parties,
      };
    }

    res.json({
      year,
      parties: Array.from(partySet).sort(),
      summary,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  getBoundariesByYear,
  getBoundariesSummaryByYear,
};
