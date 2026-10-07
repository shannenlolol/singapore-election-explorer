"""Temporary migration contract tests; no server or database required."""
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

import app


class SummaryParityTests(unittest.TestCase):
    def test_search_query_and_display_contract_matches_react(self):
        from urllib.parse import parse_qs
        for filters in [
            {},
            {"years": [2020, 2025], "winners": ["PAP", "WP"], "contesting": ["WP", "PSP"],
             "types": ["GRC", "SMC"], "constituencies": ["Aljunied", "Tanjong Pagar"]},
        ]:
            rows = [{"year": 2025, "constituency": "Aljunied", "constituency_type": "GRC",
                     "winner_party": "WP", "contesting_parties": "PAP,WP", "margin_pct": 19.426}]
            with patch.object(app, "backend_get_json", return_value={"rows": rows}) as request:
                count, displayed = app.update_table(*(filters.get(key, []) for key in
                    ["years", "winners", "contesting", "types", "constituencies"]), {"parties": []})
            result = subprocess.run(
                ["node", "--input-type=module", "-e", """
                    import {searchQuery, formatPercent} from './frontend/src/features/dashboard/model.js';
                    const filters = JSON.parse(process.argv[1]);
                    console.log(JSON.stringify({query: searchQuery(filters), margin: formatPercent(19.426)}));
                """, json.dumps(filters)], capture_output=True, text=True, check=True,
                cwd=Path(__file__).resolve().parents[1],
            )
            react = json.loads(result.stdout)
            legacy_query = {key: [value] for key, value in request.call_args.kwargs["params"].items() if value}
            self.assertEqual(parse_qs(react["query"]), legacy_query)
            self.assertEqual(count, "1")
            self.assertEqual(displayed[0]["margin_pct"], react["margin"])

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
