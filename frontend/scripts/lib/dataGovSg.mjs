// Fetch helpers for data.gov.sg, ported from backend/scripts/sync_data_gov_sg.mjs.

export const DATASETS = {
  parties: "d_ef163fd9ebc3c2f21032c29da3bd3f77",
  electors: "d_fdfb854fcb7428b29734d2e0c0674220",
  dates: "d_00d89e5d100a612e36432d91493785bd",
  results: "d_581a30bee57fa7d8383d6bc94739ad00",
};

export const BOUNDARY_DATASET_BY_YEAR = {
  2006: "d_7fb48bf0b7b7c8deeccfb2b40d120e08",
  2011: "d_305b03ed3c477aba648eeddaea2d4279",
  2015: "d_1dea85025d48bc75ed566eb2696b7e0f",
  2020: "d_6077aa5ab73d447b32f451ea224221b6",
  2025: "d_7ddf956dfc1c59080bf95bba1c58a5d2",
};

const CKAN_SEARCH_URL = "https://data.gov.sg/api/action/datastore_search";
const API_OPEN_BASE = "https://api-open.data.gov.sg/v1/public/api/datasets";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Spread retries out so repeated 429s don't all land at the same moment.
const jitter = ms => Math.round(ms * (Math.random() * 0.25 + 0.875));

let lastCkanCallAt = 0;
// The CKAN datastore_search endpoint rate-limits aggressively, so space out calls.
async function throttleCkan(minGapMs) {
  const wait = lastCkanCallAt + minGapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCkanCallAt = Date.now();
}

async function fetchJsonWithRetry(url, options = {}) {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
    if (response.ok) return response.json();
    if (response.status === 429) {
      // Honour Retry-After when given, otherwise back off exponentially; cap at a minute.
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1200 * 2 ** (attempt - 1);
      await sleep(Math.min(jitter(waitMs), 60_000));
      continue;
    }
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for ${url}. ${text.slice(0, 200)}`);
  }
  throw new Error(`HTTP 429 persisted after retries for ${url}`);
}

export async function fetchAllRows(datasetId) {
  const limit = 1000;
  let offset = 0;
  const all = [];
  while (true) {
    await throttleCkan(350);
    const url = new URL(CKAN_SEARCH_URL);
    url.searchParams.set("resource_id", datasetId);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const json = await fetchJsonWithRetry(url);
    const records = Array.isArray(json?.result?.records) ? json.result.records : [];
    all.push(...records);
    offset += records.length;
    if (records.length === 0 || offset >= Number(json?.result?.total || 0)) break;
    await sleep(150);
  }
  return all;
}

// GeoJSON datasets are downloaded through a short-lived signed URL from poll-download.
export async function fetchGeoJson(datasetId, apiKey = process.env.DGS_API_KEY) {
  const headers = { Accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  const poll = await fetchJsonWithRetry(`${API_OPEN_BASE}/${datasetId}/poll-download`, { headers });
  const signedUrl = poll?.data?.url;
  if (!signedUrl) throw new Error(`poll-download returned no url for dataset ${datasetId}`);
  const geo = await fetchJsonWithRetry(signedUrl);
  if (geo?.type !== "FeatureCollection" || !Array.isArray(geo.features) || !geo.features.length) {
    throw new Error(`Invalid or empty GeoJSON downloaded for dataset ${datasetId}`);
  }
  return geo;
}
