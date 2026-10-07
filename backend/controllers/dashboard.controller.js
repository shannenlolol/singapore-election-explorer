const { analyseContest } = require("../domain/electionResults");

function splitCsvParam(value) {
  const s = String(value || "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map(function (x) {
      return String(x).trim();
    })
    .filter(function (x) {
      return x.length > 0;
    });
}

function buildInClause(values, params) {
  if (!values || values.length === 0) {
    return { sql: "", params };
  }

  const placeholders = values.map(function () {
    return "?";
  });

  for (const v of values) {
    params.push(v);
  }

  return { sql: `(${placeholders.join(",")})`, params };
}

async function getDashboardOptions(req, res, next) {
  try {
    const pool = req.app.locals.pool;
    const [yearsRows] = await pool.query(`
      SELECT DISTINCT year
      FROM ge_summary
      ORDER BY year DESC
    `);

    const [partyRows] = await pool.query(`
      SELECT labels.abbreviation, p.political_party AS full_name
      FROM (
        SELECT abbreviation FROM political_parties
        UNION SELECT party AS abbreviation FROM ge_candidate_results
      ) labels
      LEFT JOIN political_parties p ON p.abbreviation = labels.abbreviation
      ORDER BY labels.abbreviation ASC
    `);

    const [constRows] = await pool.query(`
      SELECT DISTINCT
        year,
        constituency,
        constituency_type
      FROM ge_summary
      ORDER BY year DESC, constituency ASC
    `);
    const [dateRows] = await pool.query(`
      SELECT
        year,
        nomination_day,
        polling_day
      FROM ge_dates
      ORDER BY year ASC
    `);

    res.json({
      years: yearsRows.map(function (r) {
        return Number(r.year);
      }),
      parties: partyRows.map(function (r) {
        return {
          abbreviation: r.abbreviation,
          full_name: r.full_name,
        };
      }),
      constituencies: constRows.map(function (r) {
        return {
          year: Number(r.year),
          constituency: r.constituency,
          constituency_type: r.constituency_type,
        };
      }),
      election_dates: dateRows.map(function (r) {
        return {
          year: Number(r.year),
          nomination_day: r.nomination_day, // keep as ISO string from MySQL
          polling_day: r.polling_day,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
}

async function searchDashboardRows(req, res, next) {
  try {
    const pool = req.app.locals.pool;
    const contestingParties = splitCsvParam(req.query.contesting);
    const years = splitCsvParam(req.query.years);
    const winnerParties = splitCsvParam(req.query.winners);
    const types = splitCsvParam(req.query.types);
    const constituencies = splitCsvParam(req.query.constituencies);
    const q = String(req.query.q || "").trim();

    let sql = `
  SELECT
    s.year,
    s.constituency,
    s.constituency_type,
    s.winner_party,
    s.margin_pct,
    s.turnout_pct,
    cp.contesting_parties,
    CASE
      WHEN cp.contestants = 1 AND cp.recorded_votes = 0 THEN 'walkover'
      WHEN s.winner_party IS NULL AND s.margin_pct = 0 THEN 'tie'
      WHEN s.winner_party IS NOT NULL THEN 'contested'
      ELSE 'unavailable'
    END AS outcome
  FROM ge_summary s
  LEFT JOIN (
    SELECT
      r.year,
      r.constituency,
      COUNT(*) AS contestants, COUNT(r.vote_count) AS recorded_votes,
      GROUP_CONCAT(DISTINCT r.party ORDER BY r.party SEPARATOR ',') AS contesting_parties
    FROM ge_candidate_results r
    GROUP BY r.year, r.constituency
  ) cp
    ON cp.year = s.year AND cp.constituency = s.constituency
  WHERE 1 = 1
`;

    const params = [];

    if (years.length > 0) {
      const built = buildInClause(years, params);
      sql += ` AND s.year IN ${built.sql}`;
    }

    if (winnerParties.length > 0) {
      const built = buildInClause(winnerParties, params);
      sql += ` AND s.winner_party IN ${built.sql}`;
    }

    if (types.length > 0) {
      const built = buildInClause(types, params);
      sql += ` AND s.constituency_type IN ${built.sql}`;
    }

    if (constituencies.length > 0) {
      const built = buildInClause(constituencies, params);
      sql += ` AND s.constituency IN ${built.sql}`;
    }
    if (contestingParties.length > 0) {
      // Match if any selected party is in the concatenated list.
      // This is a safe approach using FIND_IN_SET for each party (OR-ed).
      const orParts = [];
      for (const p of contestingParties) {
        orParts.push(`FIND_IN_SET(?, cp.contesting_parties) > 0`);
        params.push(p);
      }
      sql += ` AND (${orParts.join(" OR ")})`;
    }

    if (q) {
      sql += ` AND s.constituency LIKE ?`;
      params.push(`%${q}%`);
    }

    sql += `
      ORDER BY s.year DESC, s.constituency ASC
      LIMIT 800
    `;

    const [rows] = await pool.execute(sql, params);

    res.json({
      rows: rows.map(function (r) {
        return {
          year: Number(r.year),
          constituency: r.constituency,
          constituency_type: r.constituency_type,
          winner_party: r.winner_party,
          margin_pct: r.margin_pct === null ? null : Number(r.margin_pct),
          turnout_pct: r.turnout_pct === null ? null : Number(r.turnout_pct),

          outcome: r.outcome,
          contesting_parties: r.contesting_parties || "",
        };
      }),
    });
  } catch (e) {
    next(e);
  }
}

async function getDashboardDetails(req, res, next) {
  try {
    const pool = req.app.locals.pool;
    const year = Number(req.query.year);
    const constituency = String(req.query.constituency || "").trim();

    if (!Number.isInteger(year) || year < 1950 || year > 2100 || !constituency) {
      res
        .status(400)
        .json({ message: "Missing or invalid year / constituency." });
      return;
    }

    // Party -> full name mapping for tooltip
    const [partyMapRows] = await pool.query(`
      SELECT abbreviation, political_party AS full_name
      FROM political_parties
    `);

    const partyNameMap = {};
    for (const r of partyMapRows) {
      partyNameMap[String(r.abbreviation)] = r.full_name;
    }

    const [partyRows] = await pool.execute(
      `SELECT party, candidates, vote_count FROM ge_candidate_results
       WHERE year = ? AND constituency = ?`,
      [year, constituency],
    );

    // Elector stats (columns per your schema)
    const [electorRows] = await pool.execute(
      `
      SELECT
        year,
        constituency,
        no_of_registered_electors,
        no_of_rejected_votes,
        no_of_spoilt_ballot_papers
      FROM ge_elector_stats
      WHERE year = ?
        AND constituency = ?
      LIMIT 1
      `,
      [year, constituency],
    );

    const result = analyseContest(partyRows, electorRows[0]);
    res.json({
      year,
      constituency,
      outcome: result.outcome,
      winner_party: result.winner_party,
      margin_pct: result.margin_pct,
      turnout_pct: result.turnout_pct,
      parties: result.contestants.map(function (r) {
        return {
          party: r.party,
          party_full_name: partyNameMap[String(r.party)] || null,
          vote_count: r.vote_count === null ? null : Number(r.vote_count),
          vote_share: r.vote_share === null ? null : Number(r.vote_share),
          candidates: r.candidates || "",
        };
      }),
      elector: electorRows.length > 0 ? electorRows[0] : null,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  getDashboardOptions,
  searchDashboardRows,
  getDashboardDetails,
};
