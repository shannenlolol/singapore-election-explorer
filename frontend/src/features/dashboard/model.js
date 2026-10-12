export const emptyFilters = () => ({ years: [], contesting: [], winners: [], types: [], constituencies: [] });
export const rowKey = row => JSON.stringify([row.year, row.constituency]);
export const splitCandidates = value => String(value || "").split(/[;|]/).map(v => v.trim()).filter(Boolean);
export const splitParties = value => String(value || "").split(",").map(v => v.trim()).filter(Boolean);
export function searchQuery(filters) {
  const params = new URLSearchParams();
  for (const key of Object.keys(emptyFilters())) {
    const values = [...new Set(filters[key] || [])];
    if (values.length) params.set(key, values.join(","));
  }
  return params.toString();
}
// Browser version of the API's /search query. Filters combine with AND; values within one
// filter combine with OR. "contesting" matches when any selected party stood in the contest.
// `q` is a case-insensitive "name contains" match. Rows keep their input order
// (results.json is already newest year first, then by name), and there is no row limit.
export function filterResults(rows, filters = {}) {
  const selected = key => new Set((filters[key] || []).map(String));
  const years = selected("years"), contesting = selected("contesting"), winners = selected("winners");
  const types = selected("types"), constituencies = selected("constituencies");
  const q = String(filters.q || "").trim().toLowerCase();
  return rows.filter(row =>
    (!years.size || years.has(String(row.year)))
    && (!winners.size || winners.has(row.winner_party))
    && (!types.size || types.has(row.constituency_type))
    && (!constituencies.size || constituencies.has(row.constituency))
    && (!contesting.size || splitParties(row.contesting_parties).some(party => contesting.has(party)))
    && (!q || row.constituency.toLowerCase().includes(q)));
}
export function formatNumber(value) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? "—" : Number(value).toLocaleString("en-SG");
}
export function formatPercent(value, digits = 3, scale = 1) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? "—" : `${(Number(value) * scale).toFixed(digits)}%`;
}
export function sortRows(rows, key, direction) {
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    // Unavailable values remain last in either direction.
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    const comparison = typeof av === "number" && typeof bv === "number"
      ? av - bv : String(av).localeCompare(String(bv));
    return direction === "desc" ? -comparison : comparison;
  });
}
