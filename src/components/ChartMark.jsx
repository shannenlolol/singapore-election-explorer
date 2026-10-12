import React, { useId, useState } from 'react';

// A focusable chart mark exposes the same exact value to pointer and keyboard users.
export default function ChartMark({ label, className, style, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [offset, setOffset] = useState(0);
  function show(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const width = Math.min(230, window.innerWidth - 24);
    setOffset(Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)) - bounds.left);
    setOpen(true);
  }
  return <div className={`chart-mark ${className || ''}`} style={style} tabIndex={0} role="img" aria-label={label} aria-describedby={open ? id : undefined}
    onMouseEnter={show} onMouseLeave={event => { if (document.activeElement !== event.currentTarget) setOpen(false); }}
    onFocus={show} onBlur={() => setOpen(false)} onClick={show} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); } }}>
    {children}
    {open && <span className="chart-tooltip" role="tooltip" id={id} style={{ left: offset }}>{label}</span>}
  </div>;
}
