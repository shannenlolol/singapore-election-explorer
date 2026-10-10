import React from "react";
import { useMemo, useRef, useState } from "react";
import { useResource } from "./useResource.js";
import { emptyFilters, rowKey, searchQuery } from "./model.js";
import MultiFilter from "./MultiFilter.jsx";
import ResultsTable from "./ResultsTable.jsx";
import ConstituencyDetails from "./ConstituencyDetails.jsx";

export default function SearchDashboard() {
  const options = useResource("/api/dashboard/options");
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState(null);
  const trigger = useRef(null);
  const query = searchQuery(filters);
  const results = useResource(options.data ? `/api/dashboard/search?${query}` : null);
  const partyNames = useMemo(() => Object.fromEntries((options.data?.parties || []).map(party => [party.abbreviation, party.full_name])), [options.data]);
  const filterOptions = useMemo(() => {
    const data = options.data;
    if (!data) return {};
    const parties = data.parties.map(party => ({ value: party.abbreviation, label: `${party.abbreviation} — ${party.full_name || party.abbreviation}` }));
    return {
      years: [...data.years].sort((a, b) => a - b).map(year => ({ value: String(year), label: String(year) })),
      contesting: parties, winners: parties,
      types: ["GRC", "SMC"].map(type => ({ value: type, label: type })),
      constituencies: [...new Set(data.constituencies.map(row => row.constituency))].sort().map(name => ({ value: name, label: name })),
    };
  }, [options.data]);
  function closeDetails() { setSelected(null); trigger.current?.focus(); }
  function updateFilter(key, values) { setFilters(previous => ({ ...previous, [key]: values })); setSelected(null); }
  const rows = results.data?.rows || [];
  return <section aria-label="Search election results">
    <div className="search-panel-heading"><h2>Filter results</h2>
      <button onClick={() => { setFilters(emptyFilters()); setSelected(null); }}>Reset filters</button>
    </div>
    {options.loading && <p role="status">Loading search filters…</p>}
    {options.error && <div role="alert"><p>{options.error}</p><button onClick={options.retry}>Retry filters</button></div>}
    {options.data && <>
      <div className="search-filters">{[["years", "Year"], ["contesting", "Contesting party"], ["winners", "Winner party"], ["types", "Constituency type"], ["constituencies", "Constituency"]].map(([key, label]) => <MultiFilter key={key} label={label} options={filterOptions[key]} selected={filters[key]} onChange={values => updateFilter(key, values)} />)}</div>

      {results.loading && <p role="status">Loading election results…</p>}
      {results.error && <div role="alert"><p>{results.error}</p><button onClick={results.retry}>Retry results</button></div>}
      {results.data && <>
        <div className="results-heading"><p role="status"><strong>{rows.length}</strong> results</p><span className="search-muted">Select a row for details</span></div>
        {rows.length >= 800 && <p className="search-muted">Showing up to 800 results. Narrow the filters to see more specific matches.</p>}
        {!rows.length ? <div className="card-surface"><h2>No matching elections</h2><p>Try clearing a filter or resetting your search.</p></div> : <div className={`search-content${selected ? " has-details" : ""}`}>
          <div className="card-surface search-results"><ResultsTable key={query} rows={rows} selected={selected} partyNames={partyNames} onSelect={(row, element) => { trigger.current = element; setSelected(row); }} /></div>
          {selected && <ConstituencyDetails key={rowKey(selected)} selected={selected} onClose={closeDetails} partyNames={partyNames} />}
        </div>}
      </>}
    </>}
  </section>;
}
