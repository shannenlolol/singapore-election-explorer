export function normaliseConstituencyKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

export function getBoundaryName(properties) {
  return String(properties?.ED_DESC_FU || properties?.ED_DESC || properties?.Name || "Unknown").trim();
}

export function getBoundaryResult(properties, summary) {
  const key = normaliseConstituencyKey(getBoundaryName(properties));
  const exact = summary.get(key);
  if (exact) return exact;
  // Older boundary datasets omit the SMC/GRC suffix. Never guess between two matches.
  if (/ (SMC|GRC)$/.test(key)) return null;
  const matches = [summary.get(`${key} SMC`), summary.get(`${key} GRC`)].filter(Boolean);
  return matches.length === 1 ? matches[0] : null;
}

export function getBoundaryType(properties, result) {
  const suffix = normaliseConstituencyKey(getBoundaryName(properties)).match(/ (SMC|GRC)$/)?.[1];
  return suffix || (["SMC", "GRC"].includes(result?.constituencyType) ? result.constituencyType : "");
}
