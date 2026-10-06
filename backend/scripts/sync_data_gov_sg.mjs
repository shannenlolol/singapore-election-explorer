import "../config.js";
import mysql from "mysql2/promise";

// 1. List of Political Parties
const DATASET_PARTIES = "d_ef163fd9ebc3c2f21032c29da3bd3f77";

// 2. Registered Electors, Rejected Votes and Spoilt Ballots
const DATASET_ELECTORS = "d_fdfb854fcb7428b29734d2e0c0674220";

// 3. Election Dates
const DATASET_DATES = "d_00d89e5d100a612e36432d91493785bd";

// 4. Results by Candidate
const DATASET_RESULTS = "d_581a30bee57fa7d8383d6bc94739ad00";

// 5. Boundary GeoJSON datasets by year (you already have this mapping file)
const BOUNDARY_DATASET_BY_YEAR = {
  2006: "d_7fb48bf0b7b7c8deeccfb2b40d120e08",
  2011: "d_305b03ed3c477aba648eeddaea2d4279",
  2015: "d_1dea85025d48bc75ed566eb2696b7e0f",
  2020: "d_6077aa5ab73d447b32f451ea224221b6",
  2025: "d_7ddf956dfc1c59080bf95bba1c58a5d2",
};

const API_OPEN_BASE = "https://api-open.data.gov.sg/v1/public/api/datasets";
const API_KEY = process.env.DGS_API_KEY || "";

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
function normaliseBaseName(name) {
  return String(name || "")
    .trim()
    .toUpperCase()
    .replace(/\s+(GRC|SMC)$/, "");
}
// --- rate limiting (CKAN datastore_search is sensitive) ---
let lastCkanCallAt = 0;

async function throttleCkan(minGapMs) {
  const now = Date.now();
  const wait = Math.max(0, lastCkanCallAt + minGapMs - now);
  if (wait > 0) {
    await sleep(wait);
  }
  lastCkanCallAt = Date.now();
}

function jitter(ms) {
  const r = Math.random() * 0.25 + 0.875; // 0.875 .. 1.125
  return Math.round(ms * r);
}

async function fetchJsonWithRetry(url, options) {
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });

    if (res.ok) {
      return await res.json();
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      let waitMs = jitter(1200 * Math.pow(2, attempt - 1)); // exponential + jitter

      if (retryAfter) {
        const asNumber = Number(retryAfter);
        if (Number.isFinite(asNumber) && asNumber > 0) {
          waitMs = jitter(asNumber * 1000);
        }
      }

      // cap wait to something sane
      waitMs = Math.min(waitMs, 60_000);

      await sleep(waitMs);
      continue;
    }

    const text = await res.text().catch(function () {
      return "";
    });

    throw new Error(`HTTP ${res.status} for ${url}. ${text.slice(0, 200)}`);
  }

  throw new Error(`HTTP 429 persisted after retries for ${url}`);
}

async function fetchAllRows(datasetId) {
  const base = "https://data.gov.sg/api/action/datastore_search";

  // 5000 is more likely to trigger throttling; keep it smaller
  const limit = 1000;

  let offset = 0;
  let all = [];

  while (true) {
    // ensure we don't spam CKAN
    await throttleCkan(350);

    const url = new URL(base);
    url.searchParams.set("resource_id", datasetId);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const json = await fetchJsonWithRetry(url.toString(), { method: "GET" });

    const records =
      json && json.result && Array.isArray(json.result.records)
        ? json.result.records
        : [];

    all = all.concat(records);

    const total = Number(json && json.result ? json.result.total : 0);
    offset += records.length;

    if (records.length === 0 || offset >= total) {
      break;
    }

    // extra small pause between pages
    await sleep(150);
  }

  return all;
}


function toInt(v) {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toFloat(v) {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function toDate(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  return s.slice(0, 10);
}

async function getTableColumns(db, tableName) {
  const sql = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
  `;
  const [rows] = await db.execute(sql, [tableName]);

  const set = new Set();
  for (const r of rows) {
    if (r && r.COLUMN_NAME) {
      set.add(String(r.COLUMN_NAME));
    }
  }
  return set;
}

function chooseElectorColumnMap(columns) {
  const map = { registered: null, rejected: null, spoilt: null };

  if (columns.has("no_of_registered_electors")) {
    map.registered = "no_of_registered_electors";
  } else if (columns.has("registered_electors")) {
    map.registered = "registered_electors";
  }

  if (columns.has("no_of_rejected_votes")) {
    map.rejected = "no_of_rejected_votes";
  } else if (columns.has("rejected_votes")) {
    map.rejected = "rejected_votes";
  }

  if (columns.has("no_of_spoilt_ballot_papers")) {
    map.spoilt = "no_of_spoilt_ballot_papers";
  } else if (columns.has("spoilt_ballots")) {
    map.spoilt = "spoilt_ballots";
  }

  return map;
}

function choosePartiesColumnMap(columns) {
  const map = { abbr: null, name: null };

  if (columns.has("abbreviation")) {
    map.abbr = "abbreviation";
  } else if (columns.has("party")) {
    map.abbr = "party";
  }

  if (columns.has("political_party")) {
    map.name = "political_party";
  } else if (columns.has("party_name")) {
    map.name = "party_name";
  }

  return map;
}

// -----------------------------
// Geo helpers for boundary sync
// -----------------------------
function upperTrim(value) {
  return String(value || "").trim().toUpperCase();
}

function getBoundaryName(properties) {
  if (properties && properties.ED_DESC_FU) return String(properties.ED_DESC_FU);
  if (properties && properties.ED_DESC) return String(properties.ED_DESC);
  if (properties && properties.Name) return String(properties.Name);
  return "Unknown";
}

function inferBoundaryType(name) {
  const n = upperTrim(name);
  if (n.endsWith(" SMC")) return "SMC";
  if (n.endsWith(" GRC")) return "GRC";
  return null;
}

function bboxFromGeometry(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    return null;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  function walkCoords(coords) {
    if (!Array.isArray(coords)) return;

    // coordinate pair [lng, lat]
    if (
      coords.length === 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      const lng = coords[0];
      const lat = coords[1];

      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;

      return;
    }

    for (const c of coords) {
      walkCoords(c);
    }
  }

  walkCoords(geometry.coordinates);

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
    return null;
  }

  return { minLng, minLat, maxLng, maxLat };
}

async function pollDownloadUrl(datasetId) {
  const url = `${API_OPEN_BASE}/${datasetId}/poll-download`;

  const headers = { Accept: "application/json" };
  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }

  const json = await fetchJsonWithRetry(url, { method: "GET", headers });

  const signedUrl = json && json.data && json.data.url ? String(json.data.url) : "";
  if (!signedUrl) {
    throw new Error(`poll-download returned no url for dataset ${datasetId}`);
  }

  return signedUrl;
}

async function fetchGeoJsonFromDataset(datasetId) {
  const signedUrl = await pollDownloadUrl(datasetId);
  const geo = await fetchJsonWithRetry(signedUrl, { method: "GET" });

  if (!geo || geo.type !== "FeatureCollection" || !Array.isArray(geo.features)) {
    throw new Error(`Invalid GeoJSON downloaded for dataset ${datasetId}`);
  }

  return geo;
}

async function upsertBoundaries(db, year, datasetId, geojson) {
  const insertBoundariesSql = `
    INSERT INTO ge_boundaries (year, source_dataset_id, geojson, last_synced_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      source_dataset_id = VALUES(source_dataset_id),
      geojson = VALUES(geojson),
      last_synced_at = CURRENT_TIMESTAMP
  `;

  await db.execute(insertBoundariesSql, [
    year,
    datasetId,
    JSON.stringify(geojson),
  ]);

  // Optional: feature table (fast runtime filtering)
  // Clear and repopulate for that year to avoid stale features
  await db.execute("DELETE FROM ge_boundary_features WHERE year = ?", [year]);

  const insertFeatureSql = `
    INSERT INTO ge_boundary_features
      (year, constituency, constituency_type, properties, geometry, min_lng, min_lat, max_lng, max_lat, last_synced_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;

  for (const f of geojson.features) {
    const props = f && f.properties ? f.properties : {};
    const geom = f && f.geometry ? f.geometry : null;

    if (!geom) continue;

    const constituency = String(getBoundaryName(props) || "").trim();
    if (!constituency) continue;

    const constituencyType = inferBoundaryType(constituency);

    const bb = bboxFromGeometry(geom);

    await db.execute(insertFeatureSql, [
      year,
      constituency,
      constituencyType,
      props ? JSON.stringify(props) : null,
      JSON.stringify(geom),
      bb ? bb.minLng : null,
      bb ? bb.minLat : null,
      bb ? bb.maxLng : null,
      bb ? bb.maxLat : null,
    ]);
  }
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "app_user",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "election_db",
  });

  // ---- Introspect current table schemas (so we insert into the correct columns) ----
  const electorCols = await getTableColumns(db, "ge_elector_stats");
  const partiesCols = await getTableColumns(db, "political_parties");

  const electorMap = chooseElectorColumnMap(electorCols);
  const partiesMap = choosePartiesColumnMap(partiesCols);

  // 0) GeoJSON boundaries (NEW)
  console.log("Fetching + upserting GeoJSON boundaries...");
  for (const yearStr of Object.keys(BOUNDARY_DATASET_BY_YEAR)) {
    const year = Number(yearStr);
    const datasetId = BOUNDARY_DATASET_BY_YEAR[yearStr];

    if (!Number.isFinite(year) || !datasetId) {
      continue;
    }

    console.log(`  - Year ${year}: dataset ${datasetId}`);
    const geojson = await fetchGeoJsonFromDataset(datasetId);
    await upsertBoundaries(db, year, datasetId, geojson);
  }

  // 1) Results by candidate
  console.log("Fetching results by candidate...");
  const results = await fetchAllRows(DATASET_RESULTS);

  console.log("Upserting ge_candidate_results...");
  const insertResultsSql = `
    INSERT INTO ge_candidate_results
      (year, constituency, constituency_type, candidates, party, vote_count, vote_percentage)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      constituency_type = VALUES(constituency_type),
      candidates = VALUES(candidates),
      vote_count = VALUES(vote_count),
      vote_percentage = VALUES(vote_percentage)
  `;

  for (const r of results) {
    const year = toInt(r.year);
    const constituency = String(r.constituency || "").trim();
    const ctype = String(r.constituency_type || "").trim() || null;
    const candidates = String(r.candidates || "").trim() || null;
    const party = String(r.party || "").trim();
    const voteCount = toInt(r.vote_count);
    const votePct = toFloat(r.vote_percentage);

    if (!year || !constituency || !party) {
      continue;
    }

    await db.execute(insertResultsSql, [
      year,
      constituency,
      ctype,
      candidates,
      party,
      voteCount,
      votePct,
    ]);
  }

  // 2) Elector stats
  console.log("Fetching elector stats...");
  const electors = await fetchAllRows(DATASET_ELECTORS);

  console.log("Upserting ge_elector_stats...");
  const registeredCol = electorMap.registered || "registered_electors";
  const rejectedCol = electorMap.rejected || "rejected_votes";
  const spoiltCol = electorMap.spoilt || "spoilt_ballots";

  const insertElectorsSql = `
    INSERT INTO ge_elector_stats
      (year, constituency, ${registeredCol}, ${rejectedCol}, ${spoiltCol})
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      ${registeredCol} = VALUES(${registeredCol}),
      ${rejectedCol} = VALUES(${rejectedCol}),
      ${spoiltCol} = VALUES(${spoiltCol})
  `;

  for (const r of electors) {
    const year = toInt(r.year);
    const constituency = String(r.constituency || "").trim();

    const registered = toInt(r.no_of_registered_electors);
    const rejected = toInt(r.no_of_rejected_votes);
    const spoilt = toInt(r.no_of_spoilt_ballot_papers);

    if (!year || !constituency) {
      continue;
    }

    await db.execute(insertElectorsSql, [
      year,
      constituency,
      registered,
      rejected,
      spoilt,
    ]);
  }

  // 3) Election dates
  console.log("Fetching election dates...");
  const dates = await fetchAllRows(DATASET_DATES);

  console.log("Upserting ge_dates...");
  const insertDatesSql = `
    INSERT INTO ge_dates (year, nomination_day, polling_day)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      nomination_day = VALUES(nomination_day),
      polling_day = VALUES(polling_day)
  `;

  for (const r of dates) {
    const year = toInt(r.year);
    const nomination = toDate(r.nomination_day);
    const polling = toDate(r.polling_day);

    if (!year) {
      continue;
    }

    await db.execute(insertDatesSql, [year, nomination, polling]);
  }

// 4) Parties list (OPTIONAL)
// If this dataset gets rate-limited, do not fail the entire sync.
// You can always derive parties from ge_candidate_results.
try {
  console.log("Fetching parties list...");
  const parties = await fetchAllRows(DATASET_PARTIES);

  console.log("Upserting political_parties...");
  const abbrCol = partiesMap.abbr || "party";
  const nameCol = partiesMap.name || "party_name";

  const insertPartiesSql = `
    INSERT INTO political_parties (${abbrCol}, ${nameCol})
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE
      ${nameCol} = VALUES(${nameCol})
  `;

  for (const r of parties) {
    const abbr = String(r.abbreviation || "").trim();
    const fullName = String(r.political_party || "").trim() || null;

    if (!abbr) continue;
    await db.execute(insertPartiesSql, [abbr, fullName]);
  }
} catch (e) {
  console.log(
    "Warning: parties list sync skipped due to error:",
    String(e && e.message ? e.message : e),
  );
}

  // ---- Derived summary tables for dashboard ----
  console.log("Refreshing derived summary tables...");
  await db.query("DELETE FROM ge_top_parties");
  await db.query("DELETE FROM ge_summary");

  const refreshSql = `
  INSERT INTO ge_summary (year, constituency, constituency_type, winner_party, margin_pct, turnout_pct)
  SELECT
    s.year,
    s.constituency,
    s.constituency_type,
    s.winner_party,
    (s.winner_share - s.runnerup_share) * 100 AS margin_pct,
    CASE
      WHEN e.${registeredCol} IS NULL OR e.${registeredCol} = 0 THEN NULL
      ELSE (
        (
          s.total_valid_votes
          + COALESCE(e.${rejectedCol}, 0)
          + COALESCE(e.${spoiltCol}, 0)
        ) / e.${registeredCol}
      ) * 100
    END AS turnout_pct
  FROM (
    SELECT
      x.year,
      x.constituency,
      MAX(x.constituency_type) AS constituency_type,
      SUM(x.party_votes) AS total_valid_votes,

      SUBSTRING_INDEX(
        GROUP_CONCAT(x.party ORDER BY x.party_votes DESC SEPARATOR ','),
        ',', 1
      ) AS winner_party,

      MAX(x.party_votes / NULLIF(x.total_votes, 0)) AS winner_share,

      CAST(
        SUBSTRING_INDEX(
          SUBSTRING_INDEX(
            GROUP_CONCAT(x.party_votes / NULLIF(x.total_votes, 0) ORDER BY x.party_votes DESC SEPARATOR ','),
            ',', 2
          ),
          ',', -1
        ) AS DECIMAL(10, 6)
      ) AS runnerup_share
    FROM (
      SELECT
        p.year,
        p.constituency,
        p.party,
        MAX(p.constituency_type) AS constituency_type,
        SUM(COALESCE(p.vote_count, 0)) AS party_votes,
        SUM(SUM(COALESCE(p.vote_count, 0))) OVER (PARTITION BY p.year, p.constituency) AS total_votes
      FROM ge_candidate_results p
      GROUP BY p.year, p.constituency, p.party
    ) x
    GROUP BY x.year, x.constituency
  ) s
  LEFT JOIN ge_elector_stats e
    ON e.year = s.year AND e.constituency = s.constituency
  `;
  await db.query(refreshSql);

  const topSql = `
  INSERT INTO ge_top_parties (year, constituency, party, rank_no)
  SELECT
    x.year,
    x.constituency,
    x.party,
    x.rank_no
  FROM (
    SELECT
      r.year,
      r.constituency,
      r.party,
      DENSE_RANK() OVER (
        PARTITION BY r.year, r.constituency
        ORDER BY SUM(COALESCE(r.vote_count, 0)) DESC
      ) AS rank_no
    FROM ge_candidate_results r
    GROUP BY r.year, r.constituency, r.party
  ) x
  WHERE x.rank_no <= 3
  `;
  await db.query(topSql);
  // ---------------------------------------------------------
  // Backfill ge_boundary_features.constituency_type (IMPORTANT)
  // Some boundary rows have NULL constituency_type because
  // older GeoJSON names might not carry GRC/SMC consistently.
  //
  // We resolve by:
  // 1) Suffix from boundary name (… SMC / … GRC)
  // 2) Else join to ge_candidate_results via normalised base name
  // ---------------------------------------------------------
  console.log("Backfilling boundary constituency_type from results...");

  const backfillTypeSql = `
    UPDATE ge_boundary_features bf
    LEFT JOIN (
      SELECT
        year,
        REGEXP_REPLACE(UPPER(TRIM(constituency)), '\\\\s+(GRC|SMC)$', '') AS base_name,
        MAX(NULLIF(TRIM(constituency_type), '')) AS ctype
      FROM ge_candidate_results
      GROUP BY year, base_name
    ) cr
      ON cr.year = bf.year
     AND cr.base_name = REGEXP_REPLACE(UPPER(TRIM(bf.constituency)), '\\\\s+(GRC|SMC)$', '')
    SET bf.constituency_type =
      COALESCE(
        NULLIF(TRIM(bf.constituency_type), ''),
        CASE
          WHEN UPPER(TRIM(bf.constituency)) LIKE '% SMC' THEN 'SMC'
          WHEN UPPER(TRIM(bf.constituency)) LIKE '% GRC' THEN 'GRC'
          ELSE NULL
        END,
        cr.ctype
      )
    WHERE bf.year IS NOT NULL
  `;

  await db.query(backfillTypeSql);

  await db.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
