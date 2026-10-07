import React from "react";
import { partyColor } from "./summaryModel.js";

export default function SummaryCharts({ summary }) {
  const maxOverall = Math.max(1, ...summary.bars.map(item => item.count));
  const maxYear = Math.max(1, ...summary.yearly.map(item => item.total));
  return <div className="summary-chart-grid">
    <section className="summary-card" aria-labelledby="overall-heading">
      <div className="section-heading"><div><span className="eyebrow">Across all election years</span><h2 id="overall-heading">Constituencies won by party</h2></div></div>
      <p className="search-muted">One win per constituency per election. Top 12 parties; remaining parties grouped as Others.</p>
      <ol className="ranked-bars">{summary.bars.map(item => <li key={item.party}>
        <span className="rank-label"><i style={{ background: partyColor(item.party) }} aria-hidden="true" />{item.party === "—" ? "Unknown" : item.party}</span>
        <div className="rank-track" aria-hidden="true"><div style={{ width: `${item.count / maxOverall * 100}%`, background: partyColor(item.party) }} /></div><strong>{item.count}</strong>
      </li>)}</ol>
    </section>
    <section className="summary-card" aria-labelledby="yearly-heading">
      <div className="section-heading"><div><span className="eyebrow">Historical comparison</span><h2 id="yearly-heading">Constituency wins by year</h2></div></div>
      <p className="search-muted">Bar lengths show constituency counts, not parliamentary seats.</p>
      <div className="yearly-bars" role="img" aria-label="Stacked bars of constituency wins by year. Exact party counts are available in the table below.">{summary.yearly.map(row => <div className="yearly-row" key={row.year}>
        <span>{row.year}</span><div className="year-track"><div className="year-stack" style={{ width: `${row.total / maxYear * 100}%` }}>{summary.parties.filter(party => row.counts[party]).map(party => <span key={party} title={`${row.year} · ${party}: ${row.counts[party]} constituencies`} style={{ width: `${row.counts[party] / row.total * 100}%`, background: partyColor(party) }} />)}</div></div><strong>{row.total}</strong>
      </div>)}</div>
      <ul className="chart-legend" aria-label="Party colours">{summary.parties.map(party => <li key={party}><i aria-hidden="true" style={{ background: partyColor(party) }} />{party === "—" ? "Unknown" : party}</li>)}</ul>
      <details className="chart-data"><summary>View exact counts by year</summary><div className="results-scroll"><table className="results-table"><caption>Constituencies won by year and party</caption><thead><tr><th scope="col">Year</th>{summary.parties.map(party => <th key={party} scope="col">{party === "—" ? "Unknown" : party}</th>)}<th scope="col">Total</th></tr></thead><tbody>{summary.yearly.map(row => <tr key={row.year}><th scope="row">{row.year}</th>{summary.parties.map(party => <td key={party}>{row.counts[party] || 0}</td>)}<td>{row.total}</td></tr>)}</tbody></table></div></details>
    </section>
  </div>;
}
