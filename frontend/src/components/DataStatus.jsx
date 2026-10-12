import React from "react";
import { useResource } from "../features/dashboard/useResource.js";
import { loadMeta } from "../data.js";

function dataStatusLabel({ data, error, loading }) {
  if (loading) return "Checking data update time…";
  const date = new Date(data?.updatedAt);
  if (error || Number.isNaN(date.getTime())) return "Data update time unavailable";
  return `Data last updated: ${date.toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" })} SGT`;
}

// meta.json is part of the deployed site, so it only changes on a new deploy: one read is enough.
export default function DataStatus() {
  const meta = useResource("meta", loadMeta);
  return (
    <div className="data-status">
      <span title="When this site's copy of the data last changed, not when data.gov.sg published it.">{dataStatusLabel(meta)}</span>
      <span>Source: <a href="https://data.gov.sg/" target="_blank" rel="noreferrer">data.gov.sg</a> · Historical data</span>
    </div>
  );
}
