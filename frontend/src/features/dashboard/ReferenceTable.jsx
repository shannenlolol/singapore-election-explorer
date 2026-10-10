import Pagination from "../../components/Pagination.jsx";
import React, { useMemo, useState, useId } from "react";
import { sortRows } from "./model.js";

export default function ReferenceTable({ title, rows, columns, rowId, initialSort }) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(16);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState({ key: initialSort, direction: "asc" });
  const id = useId();
  const filtered = useMemo(() => sortRows(rows.filter(row => columns.some(column => String(row[column.key] ?? "").toLowerCase().includes(query.toLowerCase()))), sort.key, sort.direction), [rows, columns, query, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  return <section className="summary-card reference-card" aria-labelledby={id}>
    <div className="section-heading"><div><h2 id={id}>{title}</h2></div><span className="count-badge">{rows.length}</span></div>
    <label className="reference-search">Search {title.toLowerCase()}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Type to filter…" /></label>
    <div className="results-scroll"><table className="results-table"><caption className="visually-hidden">{title}</caption>
      <thead><tr>{columns.map(column => <th scope="col" key={column.key} aria-sort={sort.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button onClick={() => { setSort(previous => ({ key: column.key, direction: previous.key === column.key && previous.direction === "asc" ? "desc" : "asc" })); setPage(0); }}>{column.label} {sort.key === column.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</button></th>)}</tr></thead>
      <tbody>{filtered.slice(current * pageSize, (current + 1) * pageSize).map(row => <tr key={row[rowId]}>{columns.map(column => <td key={column.key}>{column.format ? column.format(row[column.key]) : row[column.key] || "—"}</td>)}</tr>)}</tbody>
    </table></div>
    {!filtered.length && <p role="status">No matching {title.toLowerCase()}.</p>}
    <Pagination total={filtered.length} page={current} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} defaultSize={16} label={`${title} pages`} />
  </section>;
}
