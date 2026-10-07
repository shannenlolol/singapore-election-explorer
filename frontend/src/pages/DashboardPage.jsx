import { useState } from "react";
import SearchDashboard from "../features/dashboard/SearchDashboard.jsx";
import LegacyDashboard from "../features/dashboard/LegacyDashboard.jsx";
import "../features/dashboard/dashboard.css";

export default function DashboardPage() {
  const [view, setView] = useState("search");
  return <main className="dashboard-page">
    <nav className="dashboard-views" aria-label="Dashboard views">
      <button aria-pressed={view === "search"} onClick={() => setView("search")}>Search</button>
      <button aria-pressed={view === "summary"} onClick={() => setView("summary")}>Summary</button>
    </nav>
    <div hidden={view !== "search"}><SearchDashboard /></div>
    {view === "summary" && <LegacyDashboard />}
  </main>;
}
