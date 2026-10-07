import { useState } from "react";
import { BarChart3, ListFilter, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import SearchDashboard from "../features/dashboard/SearchDashboard.jsx";
import SummaryDashboard from "../features/dashboard/SummaryDashboard.jsx";
import "../features/dashboard/dashboard.css";

export default function DashboardPage() {
  const [view, setView] = useState("search");
  return <main className="dashboard-page">
    <header className="dashboard-intro"><div><span className="eyebrow">Singapore · General elections</span><h1>A closer look at the vote.</h1><p>Discover the results. Understand the patterns. Explore Singapore’s electoral history.</p></div><Link className="map-shortcut" to="/map">Explore the map <ArrowUpRight size={17} aria-hidden="true" /></Link></header>
    <nav className="dashboard-views" aria-label="Dashboard views">
      <button aria-pressed={view === "search"} onClick={() => setView("search")}><ListFilter size={16} aria-hidden="true" />Search results</button>
      <button aria-pressed={view === "summary"} onClick={() => setView("summary")}><BarChart3 size={16} aria-hidden="true" />Summary</button>
    </nav>
    <div hidden={view !== "search"}><SearchDashboard /></div>
    {view === "summary" && <SummaryDashboard />}
  </main>;
}
