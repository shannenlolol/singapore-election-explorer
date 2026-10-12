// Pure transforms from raw data.gov.sg records to the static JSON files in public/data/.
// The map summary is derived in the browser from results.json (src/features/map/mapSummary.js).
import { createHash } from "node:crypto";
// CommonJS module shared with the API until backend/ is removed.
import calculations from "../../../backend/domain/electionResults.js";

const { analyseContest, groupContests, optionalNumber } = calculations;
const SEAT_TYPES = ["GRC", "SMC"];

const text = value => String(value ?? "").trim();
const toInt = value => {
  const number = optionalNumber(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
};
const toDate = value => text(value).slice(0, 10) || null;
// Matches the DECIMAL precision the API used, and keeps the files small.
const round = (value, digits) => (value === null ? null : Number(value.toFixed(digits)));
const byYearDescThenName = (a, b) => b.year - a.year || a.constituency.localeCompare(b.constituency);

// Mirrors the import: trim, skip incomplete rows, and keep the last copy of a duplicated
// (year, constituency, party, candidates) row, as the MySQL upsert did.
export function normaliseCandidateRows(records) {
  const rows = new Map();
  for (const record of records) {
    const row = {
      year: toInt(record.year),
      constituency: text(record.constituency),
      constituency_type: text(record.constituency_type) || null,
      candidates: text(record.candidates) || null,
      party: text(record.party),
      vote_count: toInt(record.vote_count),
    };
    if (!row.year || !row.constituency || !row.party) continue;
    rows.set(JSON.stringify([row.year, row.constituency, row.party, row.candidates]), row);
  }
  return [...rows.values()];
}

// Adds hand-entered contests (scripts/manual-additions.json) to the raw source records.
// An addition is all-or-nothing per contest. Once the source has any row for that year and
// constituency, the official data wins: the addition is skipped (never mixed in) and
// reported as stale, and `remaining` is the additions file without it.
// Authoring mistakes (no year, constituency or source) still throw.
export function mergeManualAdditions(source, additions) {
  const contestKey = record => JSON.stringify([toInt(record.year), text(record.constituency).toUpperCase()]);
  const stale = [];
  const merge = (records, extra = [], label) => {
    const existing = new Set(records.map(contestKey));
    const kept = [];
    for (const addition of extra) {
      const name = `${addition.year} ${addition.constituency}`;
      if (!toInt(addition.year) || !text(addition.constituency)) throw new Error(`Manual ${label} addition is missing a year or constituency.`);
      if (!text(addition.source)) throw new Error(`Manual ${label} addition for ${name} must cite a source.`);
      if (existing.has(contestKey(addition))) stale.push(`${label} for ${name}`);
      else kept.push(addition);
    }
    return kept;
  };
  const results = merge(source.resultRecords, additions.results, "results");
  const electors = merge(source.electorRecords, additions.electors, "elector statistics");
  return {
    resultRecords: [...source.resultRecords, ...results],
    electorRecords: [...source.electorRecords, ...electors],
    stale,
    remaining: { ...additions, results, electors },
  };
}

export function normaliseElectorRecords(records) {
  const electors = new Map();
  for (const record of records) {
    const year = toInt(record.year);
    const constituency = text(record.constituency);
    if (!year || !constituency) continue;
    electors.set(JSON.stringify([year, constituency]), {
      no_of_registered_electors: toInt(record.no_of_registered_electors),
      no_of_rejected_votes: toInt(record.no_of_rejected_votes),
      no_of_spoilt_ballot_papers: toInt(record.no_of_spoilt_ballot_papers),
    });
  }
  return electors;
}

// One row per contest. Combines the API's /search row with what /details returned.
export function buildResults(candidateRows, electorRecords) {
  const electors = normaliseElectorRecords(electorRecords);
  const results = [];
  for (const [key, contestants] of groupContests(candidateRows)) {
    const { year, constituency } = contestants[0];
    const elector = electors.get(key) ?? null;
    const result = analyseContest(contestants, elector ?? {});
    results.push({
      year,
      constituency,
      // Older source rows use "na"; take the first contestant with a real seat type.
      constituency_type: contestants.find(row => SEAT_TYPES.includes(row.constituency_type))?.constituency_type ?? null,
      outcome: result.outcome,
      winner_party: result.winner_party,
      margin_pct: round(result.margin_pct, 4),
      turnout_pct: round(result.turnout_pct, 4),
      contesting_parties: [...new Set(contestants.map(row => row.party))].sort().join(","),
      elector,
      contestants: result.contestants.map(row => ({
        party: row.party,
        candidates: row.candidates,
        vote_count: row.vote_count,
        vote_share: round(row.vote_share, 6),
      })),
    });
  }
  return results.sort(byYearDescThenName);
}

export function buildOptions({ results, candidateRows, partyRecords, dateRecords }) {
  // Parties come from the party list plus any abbreviation that only appears in results.
  const fullNames = new Map();
  for (const record of partyRecords) {
    const abbreviation = text(record.abbreviation);
    if (abbreviation) fullNames.set(abbreviation, text(record.political_party) || null);
  }
  const abbreviations = new Set([...fullNames.keys(), ...candidateRows.map(row => row.party)]);
  const dates = new Map();
  for (const record of dateRecords) {
    const year = toInt(record.year);
    if (year) dates.set(year, { year, nomination_day: toDate(record.nomination_day), polling_day: toDate(record.polling_day) });
  }
  return {
    years: [...new Set(results.map(row => row.year))].sort((a, b) => b - a),
    parties: [...abbreviations].sort((a, b) => a.localeCompare(b))
      .map(abbreviation => ({ abbreviation, full_name: fullNames.get(abbreviation) ?? null })),
    constituencies: results.map(({ year, constituency, constituency_type }) => ({ year, constituency, constituency_type })),
    election_dates: [...dates.values()].sort((a, b) => a.year - b.year),
  };
}

// The only properties the map reads (see getBoundaryName in src/features/map/boundaryModel.js).
const BOUNDARY_PROPERTIES = ["ED_DESC_FU", "ED_DESC", "Name"];
const getBoundaryLabel = properties => BOUNDARY_PROPERTIES.map(key => text(properties?.[key])).find(Boolean) || "Unknown";

// 5 decimal places is about 1 m on the ground, far finer than the map ever draws.
// Rounding (rather than shape simplification) keeps shared borders identical in
// neighbouring constituencies, so no gaps or overlaps can appear between them.
function shrinkRing(ring, digits) {
  const points = [];
  for (const [lng, lat] of ring) {
    const point = [round(lng, digits), round(lat, digits)];
    const last = points.at(-1);
    if (!last || last[0] !== point[0] || last[1] !== point[1]) points.push(point);
  }
  // A valid ring has at least three distinct corners plus the closing point.
  return points.length >= 4 ? points : null;
}

function shrinkPolygon(rings, digits) {
  const [outer, ...holes] = rings.map(ring => shrinkRing(ring, digits));
  return outer ? [outer, ...holes.filter(Boolean)] : null;
}

export function shrinkGeoJson(geojson, digits = 5) {
  const features = geojson.features.map(feature => {
    const { type, coordinates } = feature.geometry;
    const polygons = (type === "Polygon" ? [coordinates] : coordinates)
      .map(polygon => shrinkPolygon(polygon, digits)).filter(Boolean);
    const name = getBoundaryLabel(feature.properties);
    if (!polygons.length) throw new Error(`Boundary ${name} has no usable shape after rounding.`);
    const properties = {};
    for (const key of BOUNDARY_PROPERTIES) {
      const value = text(feature.properties?.[key]);
      if (value) properties[key] = value;
    }
    const geometry = polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
    return { type: "Feature", properties, geometry };
  });
  return { type: "FeatureCollection", features };
}

// Pretty enough to review in a PR diff: one array item or object entry per line,
// without spreading every field across its own line.
export function formatJson(value) {
  const expand = (item, indent) => {
    if (Array.isArray(item)) {
      return item.length ? `[\n${item.map(entry => `${indent}  ${JSON.stringify(entry)}`).join(",\n")}\n${indent}]` : "[]";
    }
    if (item && typeof item === "object") {
      const entries = Object.entries(item).map(([key, entry]) => `${indent}  ${JSON.stringify(key)}: ${JSON.stringify(entry)}`);
      return entries.length ? `{\n${entries.join(",\n")}\n${indent}}` : "{}";
    }
    return JSON.stringify(item);
  };
  if (Array.isArray(value)) return `${expand(value, "")}\n`;
  const entries = Object.entries(value).map(([key, entry]) => `  ${JSON.stringify(key)}: ${expand(entry, "  ")}`);
  return `{\n${entries.join(",\n")}\n}\n`;
}

export function hashFiles(files) {
  const hash = createHash("sha256");
  for (const name of Object.keys(files).sort()) hash.update(name).update("\0").update(files[name]).update("\0");
  return hash.digest("hex");
}

// updatedAt only moves when the data changes, so a refetch with nothing new is a no-op diff.
export function buildMeta(previous, contentHash, now = new Date()) {
  const unchanged = previous?.contentHash === contentHash && previous?.updatedAt;
  return {
    updatedAt: unchanged ? previous.updatedAt : now.toISOString(),
    contentHash,
    source: { name: "data.gov.sg", url: "https://data.gov.sg/" },
  };
}
