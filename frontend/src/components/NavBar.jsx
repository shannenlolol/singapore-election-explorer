import { NavLink } from "react-router-dom";
import DataStatus from "./DataStatus.jsx";

export default function NavBar() {
  const navClass = ({ isActive }) => `topbar-link${isActive ? " is-active" : ""}`;
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="topbar-brand">
            <img src="/icon.svg" alt="" className="topbar-dot" />
            <div className="topbar-title">Singapore Election Explorer</div>
          </div>
          <nav className="topbar-nav" aria-label="Main navigation">
            <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>
            <NavLink to="/map" className={navClass}>Map</NavLink>
          </nav>
        </div>
        <DataStatus />
      </div>
    </header>
  );
}
