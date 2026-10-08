import ChartMark from "../../components/ChartMark.jsx";
import React from "react";
import { useEffect, useRef } from "react";
import { partyColor } from "./summaryModel.js";
import { useResource } from "./useResource.js";
import { formatNumber, formatPercent, splitCandidates } from "./model.js";

export default function ConstituencyDetails({ selected, onClose, partyNames }) {
  const heading = useRef(null);
  const params = new URLSearchParams({ year: selected.year, constituency: selected.constituency });
  const { data, error, loading, retry } = useResource(`/api/dashboard/details?${params}`);
  useEffect(() => { heading.current?.focus(); }, [selected]);
  const parties = data?.parties || [];
  const maxVotes = Math.max(1, ...parties.map(party => Number(party.vote_count) || 0));
  return (
    <aside className="search-details card-surface" aria-labelledby="constituency-heading" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
      <div className="search-panel-heading">
        <h2 id="constituency-heading" ref={heading} tabIndex={-1}>{selected.constituency} <small>{selected.year}</small></h2>
        <button type="button" onClick={onClose} aria-label="Close constituency details">Close</button>
      </div>
      {loading && <p role="status">Loading constituency details…</p>}
      {error && <div role="alert"><p>{error}</p><button onClick={retry}>Retry details</button></div>}
      {data && <>
        {data.outcome === "walkover" && <p>Uncontested return (walkover): one contestant and no vote totals are recorded in the source.</p>}
        {data.outcome === "tie" && <p>Tied vote totals: no winner is inferred.</p>}
        {data.outcome === "unavailable" && <p>Incomplete vote data: winner and vote shares are unavailable.</p>}
        <h3>Votes by candidate or team</h3>
        {!parties.length && <p>No party results available.</p>}
        <ul className="vote-bars">{parties.map(party => <li key={`${party.party}-${party.candidates}`}>
          <div><strong title={party.party_full_name || partyNames[party.party]}>{party.party}</strong>{parties.filter(other => other.party === party.party).length > 1 && <small>{party.candidates}</small>}<span>{formatNumber(party.vote_count)} votes · {formatPercent(party.vote_share, 2, 100)}</span></div>
          <ChartMark className="vote-track" label={`${party.party}: ${formatNumber(party.vote_count)} votes · ${formatPercent(party.vote_share, 2, 100)}`}><div style={{ background: partyColor(party.party), width: `${Math.max(0, Number(party.vote_count) || 0) / maxVotes * 100}%` }} /></ChartMark>
        </li>)}</ul>
        <h3>Elector statistics</h3>
        <p>Turnout: {formatPercent(data.turnout_pct, 2)}. Spoilt papers are cancelled or replaced and are excluded from turnout.</p>
        {data.elector ? <dl className="elector-stats">{[
          ["Registered electors", "no_of_registered_electors"],
          ["Rejected votes", "no_of_rejected_votes"],
          ["Spoilt ballot papers", "no_of_spoilt_ballot_papers"],
        ].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{formatNumber(data.elector[key])}</dd></div>)}</dl> : <p>No elector statistics available.</p>}
        <h3>Candidates</h3>
        {parties.map(party => <section className="candidate-group" key={`${party.party}-${party.candidates}`}>
          <h4>{party.party_full_name || partyNames[party.party] || party.party} ({party.party})</h4>
          {splitCandidates(party.candidates).length ? <ul>{splitCandidates(party.candidates).map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul> : <p>No candidate names available.</p>}
        </section>)}
      </>}
    </aside>
  );
}
