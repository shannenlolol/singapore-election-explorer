export const PARTY_COLORS = { PAP: "#e14e55", WP: "#3182ce", PSP: "#d78325", SDP: "#36a37c", NSP: "#229caa", SPP: "#9169c5", PPP: "#d06b98", RDU: "#6478ce", SDA: "#5473a5", PAR: "#9c7965", SUP: "#b59b32", "—": "#8a94a5", Others: "#8a94a5" };
export function partyColor(party) {
  if (PARTY_COLORS[party]) return PARTY_COLORS[party];
  const palette = ["#538a83", "#9275ad", "#b58259", "#637baf", "#a46c85"];
  const hash = [...String(party)].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
  return palette[hash % palette.length];
}
export function summarizeResults(rows) {
  const overall = new Map(), years = new Map();
  let unknownYears = 0;
  for (const row of rows) {
    const party = row.winner_party || "—";
    overall.set(party, (overall.get(party) || 0) + 1);
    const year = Number(row.year);
    if (row.year == null || row.year === "" || !Number.isInteger(year) || year < 1950 || year > 2100) { unknownYears++; continue; }
    if (!years.has(year)) years.set(year, new Map());
    const counts = years.get(year);
    counts.set(party, (counts.get(party) || 0) + 1);
  }
  const ranked = [...overall].map(([party, count]) => ({ party, count })).sort((a, b) => b.count - a.count);
  const bars = ranked.slice(0, 12);
  if (ranked.length > 12) bars.push({ party: "Others", count: ranked.slice(12).reduce((sum, item) => sum + item.count, 0) });
  return {
    total: rows.length, ranked, bars, unknownYears,
    parties: [...overall.keys()].sort(),
    yearly: [...years].sort(([a], [b]) => a - b).map(([year, counts]) => ({ year, counts: Object.fromEntries(counts), total: [...counts.values()].reduce((sum, value) => sum + value, 0) })),
  };
}
export function formatElectionDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(date);
}
