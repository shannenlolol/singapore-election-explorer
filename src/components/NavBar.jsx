import { useRef, useEffect } from "react";
import { NavLink } from "react-router-dom";
import ThemeToggle from "./ThemeToggle.jsx";
import DataStatus from "./DataStatus.jsx";

export default function NavBar() {
  const header = useRef(null);
  useEffect(() => {
    const measure = () => document.documentElement.style.setProperty('--header-height', `${header.current?.getBoundingClientRect().height || 82}px`);
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(header.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const navClass = ({ isActive }) => `topbar-link${isActive ? " is-active" : ""}`;
  return (
    <header ref={header} className="topbar">
      <div className="topbar-inner">
          <div className="topbar-brand">
            <img src="/icon.svg" alt="" className="topbar-dot" />
            <div className="topbar-title">Singapore Election Explorer</div>
          </div>
          <nav className="topbar-nav" aria-label="Main navigation">
            <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>
            <NavLink to="/map" className={navClass}>Map</NavLink>
          </nav>
        <div className="topbar-right"><ThemeToggle /><DataStatus /></div>
      </div>
    </header>
  );
}
