import { buildMapSummary } from "./features/map/mapSummary.js";

// Static files written by scripts/build_static_data.mjs into public/data/.
const DATA_URL = "/data/";

export async function fetchJson(path, signal) {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`Could not load election data (${response.status}).`);
  return response.json();
}

// The files never change while the page is open, so each is fetched once and shared by
// every component. Requests aren't tied to one component's AbortSignal, because another
// component may be waiting on the same file; useResource discards results nobody needs.
// Failed requests are forgotten so that Retry fetches again.
const cache = new Map();
function loadFile(name) {
  if (!cache.has(name)) {
    cache.set(name, fetchJson(`${DATA_URL}${name}`).catch(error => {
      cache.delete(name);
      throw error;
    }));
  }
  return cache.get(name);
}

// Tests run every case against fresh fetch mocks.
export const clearDataCache = () => cache.clear();

export const loadOptions = () => loadFile("options.json");
export const loadResults = () => loadFile("results.json");
export const loadBoundaries = year => loadFile(`boundaries-${year}.json`);
export const loadMapSummary = async year => buildMapSummary(await loadResults(), year);

export async function loadContest(year, constituency) {
  const contest = (await loadResults()).find(row => row.year === Number(year) && row.constituency === constituency);
  if (!contest) throw new Error(`No results found for ${constituency} ${year}.`);
  return contest;
}
