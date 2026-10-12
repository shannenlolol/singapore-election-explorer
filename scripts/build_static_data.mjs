// Fetches every dataset from data.gov.sg and writes the static JSON the site serves.
// Usage: npm run build:data   (optional: DGS_API_KEY=... for GeoJSON downloads)
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  BOUNDARY_DATASET_BY_YEAR,
  DATASETS,
  fetchAllRows,
  fetchGeoJson,
} from "./lib/dataGovSg.mjs";
import {
  buildMeta,
  buildOptions,
  buildResults,
  formatJson,
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
    if (!results.some((row) => row.year === year))
      console.warn(`  Warning: no results found for ${year}.`);
  }

  // Everything is fetched before anything is written, so a failed run leaves the old files intact.
  const meta = buildMeta(await readPreviousMeta(), files);
  files["meta.json"] = formatJson(meta);
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const [name, contents] of Object.entries(files))
    await writeFile(new URL(name, OUTPUT_DIR), contents);
  // The build owns this folder: delete files it no longer produces (e.g. a dropped year).
  for (const name of await readdir(OUTPUT_DIR)) {
    if (name.endsWith(".json") && !(name in files)) {
      await rm(new URL(name, OUTPUT_DIR));
      console.log(`Removed ${name}, which the build no longer produces.`);
    }
  }
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
