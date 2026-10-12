import React from "react";
import { useId, useState } from "react";

export default function MultiFilter({ label, options, selected, onChange }) {
  const [query, setQuery] = useState("");
  const id = useId();
  const visible = options.filter(option => option.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <details className="search-filter">
      <summary>{label}<span>{selected.length ? `${selected.length} selected` : "All"}</span></summary>
      <div className="search-filter-menu">
        <label htmlFor={id}>Find {label.toLowerCase()}</label>
        <input id={id} value={query} onChange={event => setQuery(event.target.value)} type="search" />
        <button type="button" onClick={() => onChange([])}>Clear selection (all)</button>
        <fieldset><legend>{label}</legend>
          {visible.map(option => <label className="search-choice" key={option.value}>
            <input type="checkbox" checked={selected.includes(option.value)} onChange={event => onChange(event.target.checked ? [...selected, option.value] : selected.filter(value => value !== option.value))} />
            {option.label}
          </label>)}
          {!visible.length && <p>No matching options.</p>}
        </fieldset>
      </div>
    </details>
  );
}
