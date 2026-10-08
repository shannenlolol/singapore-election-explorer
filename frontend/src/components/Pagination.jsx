import React from 'react';

export default function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange, defaultSize, label }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const selected = Math.min(page, pages - 1);
  const visible = Array.from({ length: pages }, (_, index) => index).filter(index => index === 0 || index === pages - 1 || Math.abs(index - selected) <= 1);
  return <nav className="results-pagination" aria-label={label}>
    <div className="pagination-info"><span aria-live="polite">Page {selected + 1} of {pages}</span><span>{total ? selected * pageSize + 1 : 0}–{Math.min((selected + 1) * pageSize, total)} of {total} results</span></div>
    <div className="pagination-buttons">
      <button disabled={!selected} onClick={() => onPageChange(0)} aria-label="First page">«</button>
      <button disabled={!selected} onClick={() => onPageChange(selected - 1)}>Previous</button>
      {visible.map((index, position) => <React.Fragment key={index}>
        {position > 0 && index - visible[position - 1] > 1 && <span aria-hidden="true">…</span>}
        <button aria-label={`Page ${index + 1}`} aria-current={index === selected ? 'page' : undefined} onClick={() => onPageChange(index)}>{index + 1}</button>
      </React.Fragment>)}
      <button disabled={selected === pages - 1} onClick={() => onPageChange(selected + 1)}>Next</button>
      <button disabled={selected === pages - 1} onClick={() => onPageChange(pages - 1)} aria-label="Last page">»</button>
    </div>
    <label className="page-size">Rows per page <select value={pageSize} onChange={event => { onPageSizeChange(Number(event.target.value)); onPageChange(0); }}>{[defaultSize, defaultSize * 2, defaultSize * 4].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
  </nav>;
}
