function optionalPercent(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getWinnerPct(entry) {
  if (!entry?.winnerParty) return null;
  // An explicit null must not fall back to an aggregate of several independents.
  if (Object.hasOwn(entry, "winnerVotePct")) return optionalPercent(entry.winnerVotePct);
  const winner = String(entry.winnerParty).trim().toUpperCase();
  return optionalPercent(entry.parties?.[winner]?.votePct);
}

export function formatVotePct(value) {
  const percent = optionalPercent(value);
  return percent === null ? "Unavailable" : `${percent.toFixed(2)}%`;
}
