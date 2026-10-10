import ChartMark from "../../components/ChartMark.jsx";
import React, { useEffect, useRef } from "react";
import { ChevronDown, X } from "lucide-react";
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
      <div className="search-panel-heading detail-heading">
        <h2 id="constituency-heading" ref={heading} tabIndex={-1}>{selected.constituency} <small>{selected.year}</small></h2>
        <button className="detail-close" type="button" onClick={onClose} aria-label="Close constituency details" title="Close details"><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="detail-body" tabIndex={0} role="region" aria-label="Constituency results and candidates">
        {loading && <p role="status">Loading constituency details…</p>}
        {error && <div role="alert"><p>{error}</p><button onClick={retry}>Retry details</button></div>}
        {data && <>
          {data.outcome === "walkover" && <p>Uncontested return (walkover): one contestant and no vote totals are recorded in the source.</p>}
          {data.outcome === "tie" && <p>Tied vote totals: no winner is inferred.</p>}
          {data.outcome === "unavailable" && <p>Incomplete vote data: winner and vote shares are unavailable.</p>}
          <section className="detail-section" aria-labelledby="detail-votes-heading">
            <h3 id="detail-votes-heading">Votes &amp; candidates</h3>
            {!parties.length && <p>No party results available.</p>}
            <ul className="vote-bars">{parties.map(party => {
              const names = splitCandidates(party.candidates);
              const repeatedParty = parties.filter(other => other.party === party.party).length > 1;
              return <li key={`${party.party}-${party.candidates}`}>
                <details className="candidate-group" style={{ "--party-color": partyColor(party.party) }}>
                  <summary>
                    <span className="candidate-party"><strong title={party.party_full_name || partyNames[party.party]}>{party.party}</strong><ChevronDown size={16} aria-hidden="true" /></span>
                    {repeatedParty && <span className="candidate-identity">{party.candidates}</span>}
                    <span className="candidate-votes">{formatNumber(party.vote_count)} votes · {formatPercent(party.vote_share, 2, 100)}</span>
                    <span className="candidate-hint">{names.length ? `${names.length} ${names.length === 1 ? "candidate" : "candidates"}` : "Candidate names unavailable"}</span>
                  </summary>
                  <div className="candidate-list">
                    <p>{party.party_full_name || partyNames[party.party] || party.party}</p>
                    {names.length ? <ul>{names.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul> : <p>No candidate names available.</p>}
                  </div>
                </details>
                <ChartMark className="vote-track" label={`${party.party}${repeatedParty ? ` · ${party.candidates}` : ""}: ${formatNumber(party.vote_count)} votes · ${formatPercent(party.vote_share, 2, 100)}`}><div style={{ background: partyColor(party.party), width: `${Math.max(0, Number(party.vote_count) || 0) / maxVotes * 100}%` }} /></ChartMark>
              </li>;
            })}</ul>
          </section>
          <section className="detail-section" aria-label="Elector statistics">
            <p className="detail-turnout">Turnout: {formatPercent(data.turnout_pct, 2)}</p>
            <details className="elector-disclosure"><summary>Elector statistics</summary>
              {data.elector ? <dl className="elector-stats">{[
                ["Registered electors", "no_of_registered_electors"],
                ["Rejected votes", "no_of_rejected_votes"],
                ["Spoilt ballot papers", "no_of_spoilt_ballot_papers"],
              ].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{formatNumber(data.elector[key])}</dd></div>)}</dl> : <p>No elector statistics available.</p>}
              <p className="detail-note">Spoilt papers are cancelled or replaced and are excluded from turnout.</p>
            </details>
          </section>
        </>}
      </div>
    </aside>
  );
}
