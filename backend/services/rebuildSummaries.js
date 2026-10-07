const { analyseContest, groupContests } = require("../domain/electionResults");

// Call with a dedicated connection. Both derived tables publish together, or neither does.
async function rebuildSummaries(db) {
  await db.beginTransaction();
  try {
    const [rows] = await db.query("SELECT year, constituency, constituency_type, party, candidates, vote_count FROM ge_candidate_results");
    const [electors] = await db.query("SELECT * FROM ge_elector_stats");
    const electorMap = new Map(electors.map(row => [JSON.stringify([Number(row.year), row.constituency]), row]));
    await db.query("DELETE FROM ge_top_parties");
    await db.query("DELETE FROM ge_summary");
    const groups = groupContests(rows);
    for (const [key, contestants] of groups) {
      const row = contestants[0];
      const result = analyseContest(contestants, electorMap.get(key));
      const type = contestants.find(candidate => ["GRC", "SMC"].includes(candidate.constituency_type))?.constituency_type ?? null;
      await db.execute(`INSERT INTO ge_summary
        (year, constituency, constituency_type, winner_party, margin_pct, turnout_pct) VALUES (?, ?, ?, ?, ?, ?)`,
      [row.year, row.constituency, type, result.winner_party, result.margin_pct, result.turnout_pct]);
      // Rank contestants, then retain each party's best rank. Never pool independent votes to rank a winner.
      if (result.outcome !== "unavailable") {
        const ranks = new Map();
        let rank = 0, previous;
        for (const contestant of result.contestants) {
          if (rank === 0 || contestant.vote_count !== previous) rank++;
          previous = contestant.vote_count;
          if (rank <= 3 && !ranks.has(contestant.party)) ranks.set(contestant.party, rank);
        }
        for (const [party, rank] of ranks) {
          await db.execute("INSERT INTO ge_top_parties (year, constituency, party, rank_no) VALUES (?, ?, ?, ?)", [row.year, row.constituency, party, rank]);
        }
      }
    }
    await db.commit();
    return groups.size;
  } catch (error) {
    await db.rollback();
    throw error;
  }
}
module.exports = { rebuildSummaries };
