const SEAT_TYPES = ["GRC", "SMC"];

// Boundary files name constituencies "ALJUNIED GRC", while results use "Aljunied" plus a type.
export function constituencyKey(constituency, type) {
  const name = String(constituency ?? "").trim().toUpperCase();
  if (!name || name.endsWith(" SMC") || name.endsWith(" GRC") || !SEAT_TYPES.includes(type)) return name;
  return `${name} ${type}`;
}

// Map colouring and tooltips for one year, built from results.json rows.
// Party vote shares are pooled for the legend (e.g. several independents), but the
// winner's share is that single contestant's or team's.
export function buildMapSummary(results, year) {
  const summary = {};
  const partySet = new Set();
  for (const row of results.filter(result => result.year === year)) {
    const parties = {};
    for (const contestant of row.contestants) {
      const party = contestant.party.toUpperCase();
      partySet.add(party);
      parties[party] ??= { votePct: contestant.vote_share === null ? null : 0 };
      if (contestant.vote_share !== null) parties[party].votePct += contestant.vote_share * 100;
    }
    const winner = row.contestants[0];
    summary[constituencyKey(row.constituency, row.constituency_type)] = {
      winnerParty: row.winner_party ? row.winner_party.toUpperCase() : null,
      winnerVotePct: row.winner_party && winner?.vote_share != null ? winner.vote_share * 100 : null,
      outcome: row.outcome,
      constituencyType: row.constituency_type,
      parties,
    };
  }
  return { year, parties: [...partySet].sort(), summary };
}
