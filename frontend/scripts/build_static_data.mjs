// Fetches every dataset from data.gov.sg and writes the static JSON the site serves.
// Usage (from frontend/): npm run build:data   (optional: DGS_API_KEY=... for GeoJSON downloads)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  BOUNDARY_DATASET_BY_YEAR,
  DATASETS,
  fetchAllRows,
  fetchGeoJson,
} from "./lib/dataGovSg.mjs";
import {
  buildMapSummary,
  buildMeta,
  buildOptions,
  buildResults,
  formatJson,
  hashFiles,
  mergeManualAdditions,
  normaliseCandidateRows,
  shrinkGeoJson,
} from "./lib/staticData.mjs";

const OUTPUT_DIR = new URL("../public/data/", import.meta.url);
const MANUAL_ADDITIONS = new URL("manual-additions.json", import.meta.url);

async function readPreviousMeta() {
  try {
    return JSON.parse(await readFile(new URL("meta.json", OUTPUT_DIR), "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  console.log("Fetching results, electors, dates and parties…");
  const source = {
    resultRecords: await fetchAllRows(DATASETS.results),
    electorRecords: await fetchAllRows(DATASETS.electors),
  };
  const dateRecords = await fetchAllRows(DATASETS.dates);
  const partyRecords = await fetchAllRows(DATASETS.parties);
  // Never replace good data with an empty set if the source misbehaves.
  // Checked before the merge so manual additions can't mask an empty download.
  if (!normaliseCandidateRows(source.resultRecords).length)
    throw new Error(
      "Results dataset returned no usable rows; nothing written.",
    );
  const additions = JSON.parse(await readFile(MANUAL_ADDITIONS, "utf8"));
  const { resultRecords, electorRecords, stale, remaining } =
    mergeManualAdditions(source, additions);
  const candidateRows = normaliseCandidateRows(resultRecords);
  console.log(
    `Merged ${remaining.results.length} manual result and ${remaining.electors.length} elector rows.`,
  );

  const results = buildResults(candidateRows, electorRecords);
  const files = {
    "results.json": formatJson(results),
    "options.json": formatJson(
      buildOptions({ results, candidateRows, partyRecords, dateRecords }),
    ),
  };

  for (const [yearKey, datasetId] of Object.entries(BOUNDARY_DATASET_BY_YEAR)) {
    const year = Number(yearKey);
    console.log(`Fetching ${year} boundaries…`);
    files[`boundaries-${year}.json`] =
      `${JSON.stringify(shrinkGeoJson(await fetchGeoJson(datasetId)))}\n`;
    const mapSummary = buildMapSummary(results, year);
    if (!Object.keys(mapSummary.summary).length)
      console.warn(`  Warning: no results found for ${year}.`);
    files[`map-summary-${year}.json`] = formatJson(mapSummary);
  }

  // Everything is fetched before anything is written, so a failed run leaves the old files intact.
  const meta = buildMeta(await readPreviousMeta(), hashFiles(files));
  files["meta.json"] = formatJson(meta);
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const [name, contents] of Object.entries(files))
    await writeFile(new URL(name, OUTPUT_DIR), contents);
  // data.gov.sg has caught up on these contests, so its rows were used instead. Remove the
  // stale entries from the file so the refresh PR shows the clean-up for review.
  if (stale.length) {
    console.log(`data.gov.sg now publishes ${stale.join("; ")}. Removed from manual-additions.json.`);
    await writeFile(MANUAL_ADDITIONS, `${JSON.stringify(remaining, null, 2)}\n`);
  }

  console.log(
    `Wrote ${Object.keys(files).length} files: ${results.length} contests from ${candidateRows.length} candidate rows.`,
  );
  console.log(`Data last updated: ${meta.updatedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
