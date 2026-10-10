import React, { useMemo } from "react";
import { useResource } from "./useResource.js";
import { summarizeResults, formatElectionDate } from "./summaryModel.js";
import SummaryCharts from "./SummaryCharts.jsx";
import ReferenceTable from "./ReferenceTable.jsx";

const dateColumns = [{ key: "year", label: "Year" }, { key: "nomination_day", label: "Nomination day", format: formatElectionDate }, { key: "polling_day", label: "Polling day", format: formatElectionDate }];
const partyColumns = [{ key: "abbreviation", label: "Abbreviation" }, { key: "full_name", label: "Party" }];
export default function SummaryDashboard() {
  const results = useResource("/api/dashboard/search");
  const options = useResource("/api/dashboard/options");
  const summary = useMemo(() => summarizeResults(results.data?.rows || []), [results.data]);
  return <section aria-label="Election summary">
    <div className="search-panel-heading"><div><h2>At a glance</h2><p className="search-muted">Recorded constituency wins, not seats. Source coverage is incomplete.</p></div></div>
    {results.loading && <div className="summary-card" role="status">Loading election summary…</div>}
    {results.error && <div className="summary-card" role="alert"><h3>Summary unavailable</h3><p>{results.error}</p><button onClick={results.retry}>Retry summary</button></div>}
    {results.data && (summary.total ? <>
      <div className="summary-metrics">{[["Constituency results", summary.total, null], ["Election years", summary.yearly.length, summary.yearly.length ? `${summary.yearly[0].year}–${summary.yearly.at(-1).year}` : "No valid years"], ["Winning parties", summary.ranked.filter(item => item.party !== "—").length, null]].map(([label, value, note]) => <div className="summary-card metric-card" key={label}><span>{label}</span><strong>{value.toLocaleString("en-SG")}</strong>{note && <small>{note}</small>}</div>)}</div>
      {summary.total >= 800 && <p role="status" className="data-notice">This summary covers the API’s first 800 results and may be incomplete.</p>}
      {summary.unknownYears > 0 && <p className="data-notice">{summary.unknownYears} results have no valid year and are excluded from the yearly chart.</p>}
      <SummaryCharts summary={summary} />
    </> : <div className="summary-card"><h3>No election results yet</h3><p>There are no imported results available to summarize.</p></div>)}
    {options.loading && <p role="status">Loading reference tables…</p>}
    {options.error && <div role="alert" className="summary-card"><p>{options.error}</p><button onClick={options.retry}>Retry reference tables</button></div>}
    {options.data && <div className="summary-reference-grid">
      <details className="reference-disclosure"><summary>Election dates</summary><ReferenceTable title="Election dates" rows={options.data.election_dates || []} columns={dateColumns} rowId="year" initialSort="year" /></details>
      <details className="reference-disclosure"><summary>Political parties</summary><ReferenceTable title="Political parties" rows={options.data.parties || []} columns={partyColumns} rowId="abbreviation" initialSort="abbreviation" /></details>
    </div>}
  </section>;
}
