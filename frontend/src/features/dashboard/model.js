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
