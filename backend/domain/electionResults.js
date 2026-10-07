// Source rows represent individual candidates (SMC) or whole teams (GRC).
// Multiple independents in one constituency are separate contestants.
function optionalNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function analyseContest(rows, elector = {}) {
  const contestants = rows.map(row => ({
    party: row.party,
    candidates: row.candidates || "",
    vote_count: optionalNumber(row.vote_count),
  })).sort((a, b) => (b.vote_count ?? -1) - (a.vote_count ?? -1) || a.party.localeCompare(b.party) || a.candidates.localeCompare(b.candidates));
  const complete = contestants.length > 0 && contestants.every(row => row.vote_count !== null);
  const total = complete ? contestants.reduce((sum, row) => sum + row.vote_count, 0) : null;
  // The source records historical walkovers as one contestant with no vote data.
  const walkover = contestants.length === 1 && contestants[0].vote_count === null;
  const hasVotes = complete && total > 0;
  const tie = hasVotes && contestants.length > 1 && contestants[0].vote_count === contestants[1].vote_count;
  const winner = walkover || (hasVotes && !tie) ? contestants[0] : null;
  const registered = optionalNumber(elector.no_of_registered_electors);
  const rejected = optionalNumber(elector.no_of_rejected_votes);
  const ballotsCast = hasVotes && rejected !== null ? total + rejected : null;
  return {
    outcome: walkover ? "walkover" : hasVotes ? (tie ? "tie" : "contested") : "unavailable",
    winner_party: winner?.party ?? null,
    margin_pct: hasVotes && contestants.length > 1 ? (contestants[0].vote_count - contestants[1].vote_count) / total * 100 : null,
    // Spoilt papers are cancelled/replaced, not votes cast. Never assume missing rejected votes are zero.
    turnout_pct: registered > 0 && ballotsCast !== null && ballotsCast <= registered ? ballotsCast / registered * 100 : null,
    contestants: contestants.map(row => ({ ...row, vote_share: hasVotes ? row.vote_count / total : null })),
  };
}

function groupContests(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([Number(row.year), row.constituency]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

module.exports = { optionalNumber, analyseContest, groupContests };
