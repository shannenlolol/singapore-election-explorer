import { useEffect, useState } from "react";
import { apiGet } from "../api.js";

export default function DataStatus() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const next = await apiGet("/api/data-status");
        if (!cancelled) { setData(next); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  const date = data?.lastUpdated ? new Date(data.lastUpdated) : null;
  let label = failed ? "Data update time unavailable" : "Checking data update time…";
  if (!failed && data) {
    label = date && !Number.isNaN(date.getTime())
      ? `Data last updated: ${date.toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" })} SGT`
      : "Data last updated: no completed import recorded";
    if (data.status === "running") label += " · Update in progress";
    if (data.status === "failed") label += " · Latest update failed; data may be incomplete";
  }
  return (
    <div className="data-status">
      <span aria-live="polite" title="Time of the last successful local import, not the source publication date.">{label}</span>
      <span>Source: <a href="https://data.gov.sg/" target="_blank" rel="noreferrer">data.gov.sg</a> · Historical data</span>
    </div>
  );
}
