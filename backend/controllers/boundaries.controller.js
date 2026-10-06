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

// If boundary_features has null constituency_type, we can infer from name.
function inferTypeFromBoundaryName(boundaryName) {
  const up = upperTrim(boundaryName);
  if (up.endsWith(" SMC")) return "SMC";
  if (up.endsWith(" GRC")) return "GRC";
  return "";
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

    // Aggregate votes per party per constituency
    const [rows] = await pool.execute(
      `
      SELECT
        r.constituency,
        MAX(r.constituency_type) AS constituency_type,
        r.party,
        SUM(COALESCE(r.vote_count, 0)) AS party_votes,
        SUM(SUM(COALESCE(r.vote_count, 0))) OVER (PARTITION BY r.constituency) AS total_votes
      FROM ge_candidate_results r
      WHERE r.year = ?
      GROUP BY r.constituency, r.party
      `,
      [year],
    );

    // If there are no results for that year, still return an empty summary
    if (!rows || rows.length === 0) {
      res.json({ year, parties: [], summary: {} });
      return;
    }

    // Build summary keyed by boundary-style constituency key
    const summary = {};
    const partySet = new Set();

    for (const r of rows) {
      const constituency = String(r.constituency || "").trim();
      const ctypeRaw = String(r.constituency_type || "").trim().toUpperCase();
      const party = String(r.party || "").trim().toUpperCase();

      if (!constituency || !party) continue;

      const key = makeConstituencyKey(constituency, ctypeRaw);
      if (!key) continue;

      const totalVotes = Number(r.total_votes);
      const partyVotes = Number(r.party_votes);

      const votePct =
        Number.isFinite(totalVotes) && totalVotes > 0 && Number.isFinite(partyVotes)
          ? (partyVotes / totalVotes) * 100
          : null;

      partySet.add(party);

      if (!summary[key]) {
        // If we couldn’t trust ctype from results, infer from the boundary-style key
        const inferred = inferTypeFromBoundaryName(key);
        summary[key] = {
          winnerParty: null,
          constituencyType: ctypeRaw || inferred || null,
          parties: {},
        };
      }

      summary[key].parties[party] = { votePct };
    }

    // Compute winnerParty (highest votePct)
    for (const key of Object.keys(summary)) {
      const partiesObj = summary[key].parties || {};
      const parties = Object.keys(partiesObj);

      let bestParty = null;
      let bestPct = -Infinity;

      for (const p of parties) {
        const pct = partiesObj[p] && partiesObj[p].votePct !== null ? Number(partiesObj[p].votePct) : -Infinity;
        if (pct > bestPct) {
          bestPct = pct;
          bestParty = p;
        }
      }

      summary[key].winnerParty = bestParty;
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
