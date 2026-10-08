import Pagination from "../../components/Pagination.jsx";
import React from "react";
import { useMemo, useState } from "react";
import { partyColor } from "./summaryModel.js";
import { formatPercent, rowKey, sortRows, splitParties } from "./model.js";

const columns = [["year", "Year"], ["constituency", "Constituency"], ["constituency_type", "Type"], ["contesting_parties", "Contested"], ["winner_party", "Winner"], ["margin_pct", "Margin"]];
const PAGE_SIZE = 14;
export default function ResultsTable({ rows, selected, onSelect, partyNames }) {
  const [sort, setSort] = useState({ key: null, direction: "asc" });
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.direction), [rows, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  function changeSort(key) {
    setSort(previous => ({ key, direction: previous.key === key && previous.direction === "asc" ? "desc" : "asc" }));
    setPage(0);
  }
  return <>
    <div className="results-scroll">
      <table className="results-table">
        <caption>Election results. Select a constituency to view its details.</caption>
        <thead><tr>{columns.map(([key, label]) => <th key={key} scope="col" aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
          <button onClick={() => changeSort(key)}>{label}{sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : " ↕"}</button>
        </th>)}</tr></thead>
        <tbody>{sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => <tr key={rowKey(row)} className={selected && rowKey(selected) === rowKey(row) ? "is-selected" : ""}>
          <td>{row.year}</td>
          <td><button className="constituency-link" aria-label={`View ${row.constituency} ${row.year} details`} aria-pressed={Boolean(selected && rowKey(selected) === rowKey(row))} onClick={event => onSelect(row, event.currentTarget)}>{row.constituency}</button></td>
          <td>{row.constituency_type || "—"}</td>
          <td>{splitParties(row.contesting_parties).map(party => <span className="search-party" style={{ "--party-color": partyColor(party) }} title={partyNames[party]} key={party}>{party}</span>)}</td>
          <td><span className="search-party" style={{ "--party-color": partyColor(row.winner_party) }} title={partyNames[row.winner_party]}>{row.winner_party || "—"}</span></td>
          <td>{row.outcome === "walkover" ? "Walkover" : row.outcome === "tie" ? "Tie" : formatPercent(row.margin_pct)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <Pagination total={rows.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} defaultSize={PAGE_SIZE} label="Results pages" />
  </>;
}
