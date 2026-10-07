"""Temporary migration contract tests; no server or database required."""
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

import app


class SummaryParityTests(unittest.TestCase):
    def test_react_matches_all_legacy_chart_counts(self):
        rows = []
        for year in [2020, 2025]:
            for index in range(15):
                rows.extend({"year": year, "winner_party": f"P{index}"} for _ in range(index + 1))
        rows.extend([{"year": 2020, "winner_party": None}, {"year": 2025, "winner_party": "WP"}])
        result = subprocess.run(
            ["node", "--input-type=module", "-e", """
                import fs from 'node:fs';
                import { summarizeResults } from './frontend/src/features/dashboard/summaryModel.js';
                console.log(JSON.stringify(summarizeResults(JSON.parse(fs.readFileSync(0, 'utf8')))));
            """],
            input=json.dumps(rows), capture_output=True, text=True, check=True,
            cwd=Path(__file__).resolve().parents[1],
        )
        summary = json.loads(result.stdout)
        with patch.object(app, "backend_get_json", return_value={"rows": rows}):
            overall, yearly = app.build_summary("tab-summary")
        self.assertEqual(list(overall.data[0].y), [row["party"] for row in summary["bars"]])
        self.assertEqual(list(overall.data[0].x), [row["count"] for row in summary["bars"]])
        self.assertEqual(sum(overall.data[0].x), len(rows))
        for trace in yearly.data:
            self.assertEqual(list(trace.x), [str(row["year"]) for row in summary["yearly"]])
            self.assertEqual(list(trace.y), [row["counts"].get(trace.name, 0) for row in summary["yearly"]])


if __name__ == "__main__":
    unittest.main()
