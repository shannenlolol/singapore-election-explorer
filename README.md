# Singapore Election Explorer

Explore Singapore's general election results through interactive constituency maps, historical comparisons, and party-level vote breakdowns. Open the explorer directly—no account or sign-in required.

Built with **React · Leaflet · Express · MySQL**. Originally developed as an academic project, now being refactored into a maintainable portfolio application.

## What it does

- **Explore the map:** switch between boundary years, filter by constituency type or party, and inspect constituency results.
- **Compare elections:** search historical results by year, constituency, contesting party, and winner.
- **Inspect the details:** view candidates, vote shares, winning margins, and elector statistics.
- **Visualize trends:** use React charts and reference tables for constituency wins and historical comparisons.
- **Import public data:** load election datasets and GeoJSON boundaries from data.gov.sg into MySQL, then serve queries from the database.

This is an independent historical data explorer, not an official elections service or a live results feed. Boundary datasets are configured for 2006, 2011, 2015, 2020, and 2025; results availability depends on the imported source datasets.

## Screenshots

> **Map screenshot placeholder** — add `docs/screenshots/map.png` showing constituency boundaries, filters, and a selected result.

<!-- Uncomment after adding the image:
![Constituency map with party filters](docs/screenshots/map.png)
-->

> **Dashboard screenshot placeholder** — add `docs/screenshots/dashboard.png` showing election comparisons and vote breakdowns.

<!-- Uncomment after adding the image:
![Election comparison dashboard](docs/screenshots/dashboard.png)
-->

## Architecture

```text
Browser → Vite / React (5173) → /api/* → Express (4000) → MySQL (3306)

data.gov.sg → manual import script → MySQL
```

Both Search and Summary are implemented in React. Summary includes party-win rankings, yearly constituency-win comparisons, an exact-count table, and searchable/sortable election-date and party references.

The frontend uses relative URLs. Vite proxies `/api` through one browser origin during development. Express owns the public read-only election API and shared database pool. Search, Summary, and Map all run in the same React application.

```text
backend/     Express app, routes, controllers, import scripts, API tests
frontend/    React pages, data freshness, Leaflet map, styling
db/          Initial MySQL schema
docs/        Screenshot assets
```

## Run locally

### Prerequisites

- Node.js 24 (or Node.js 22.12+) and npm; `.nvmrc` selects Node.js 24.
- Docker with Docker Compose for MySQL.
- Internet access for dependency installation, data imports, and map tiles.

### 1. Install and configure

```bash
git clone https://github.com/shannenlolol/singapore-election-explorer.git
cd singapore-election-explorer
# If you use nvm:
nvm install
nvm use

npm ci --prefix backend
npm ci --prefix frontend

cp .env.example .env
cp backend/.env.example backend/.env
```

Edit both environment files:

| File | Setting | Value |
| --- | --- | --- |
| `.env` | `MYSQL_ROOT_PASSWORD` | A local database root password |
| Both files | `DB_PASSWORD` | The **same** local app database password |
| `backend/.env` | `DGS_API_KEY` | Optional data.gov.sg API key for imports |

Local `.env` files are ignored by Git; only `.env.example` templates belong in version control. The example values are placeholders; choose your own secrets.

### 2. Start MySQL and import data

```bash
docker compose up -d mysql
docker compose ps
# Wait for MySQL to become healthy before continuing.
npm run sync:data --prefix backend
```

The schema is initialized automatically on a **new** Docker volume. Importing public data can take several minutes and may be affected by upstream rate limits. The app has no bundled results; run the import before using the map or dashboard. The import rebuilds derived summary tables, so run it against your local development database.

If reusing an existing volume, initialization scripts do not run again. For a database created by an older checkout, apply the additive schema without deleting its volume:

```bash
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" election_db' < db/schema.sql
```

For an older installation that contains accounts, remove the unused account table after applying the schema:

```bash
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" election_db' < db/migrations/001-remove-accounts.sql
```

This migration deletes the old account records. The public explorer does not need them.

The schema initializes missing tables; it is not a versioned migration system and does not alter incompatible existing columns. Changing a password in `.env` does not change a user already stored in MySQL.

### 3. Start the API and frontend

With MySQL running, start these two processes from the repository root in separate terminals:

```bash
# Terminal 1 — API
npm run dev --prefix backend
```

```bash
# Terminal 2 — frontend
npm run dev --prefix frontend
```

Open **http://localhost:5173** to go directly to the Dashboard. Switch to Map using the navigation. Check database connectivity at **http://localhost:4000/api/health**.

Stop each development server with `Ctrl+C`. `docker compose stop` stops MySQL while preserving its data.

### Troubleshooting

- **API unavailable:** check `backend/.env`, MySQL health, and whether ports 3306/4000 are already occupied.
- **Empty map or dashboard:** confirm the data import completed; an empty database has no results to display.

## Data refresh and freshness

Refresh is a maintainer operation: run `npm run sync:data --prefix backend`. There is no public refresh button or import endpoint. Browsing and filtering only query MySQL; they do not trigger imports.

The header links to data.gov.sg and shows **Data last updated**, meaning the last completed local import, in Singapore time. It is not the publisher's update date. A fresh or older database without an import record shows no completed import; running and failed imports are explicitly indicated. Since the importer is not yet atomic, a failed import may leave partial data even when an older successful timestamp exists. Status is checked once a minute.

### Correcting existing derived results

After updating from an older checkout, recalculate summaries without downloading data:

```bash
npm run rebuild:summary --prefix backend
```

This corrects historical independent-candidate rankings and turnout calculations. Both derived tables are replaced in one transaction; a failure preserves the previous summaries. Source records are unchanged, and this local recalculation does not advance the last-import timestamp. Future imports use the same calculations automatically. Stop any concurrent import before rebuilding.

### Calculation and coverage rules

- Each source row is one contestant: an individual candidate or a whole GRC team. Winners and margins compare contestants, so separate independents are never added together to determine a winner.
- Margin is the difference between the top two contestants divided by total valid votes, expressed in percentage points. Details expose fractional vote shares; the UI displays percentages. Map party shares are grouped, but its winner and shading use the winning contestant.
- Turnout is `(valid votes + rejected votes) / registered electors × 100`. Spoilt papers are cancelled/replaced and excluded, consistent with [ELD’s polling explanation](https://www.eld.gov.sg/candidate_parliamentary_polling.html). Missing inputs produce unavailable turnout.
- A sole contestant with no vote total is treated as an uncontested return, following the historical source convention. Vote shares, margin, and turnout remain unavailable. Tied totals do not imply a winner; incomplete totals do not imply zero votes.
- The [results dataset](https://data.gov.sg/datasets/d_581a30bee57fa7d8383d6bc94739ad00/view) inspected on 7 October 2026 contains 753 constituency/year records, including only 33 for 2025: it omits the Marine Parade walkover. The app does not invent missing records. Charts count available constituencies, **not seats or a complete official tally**.
- Search currently returns at most 800 results; Search and Summary warn when that limit is reached. Server pagination and complete import publication remain follow-up work.

## Start from VS Code

Open this folder in VS Code. Use **Terminal → Run Task → Explorer: database**, wait for MySQL to become healthy, then run **Explorer: start app** to launch the API and frontend in dedicated terminals. Install dependencies and configure the environment first using the instructions above. Stop any existing servers on ports 4000 and 5173 before starting another copy.

## Development checks

```bash
npm test --prefix backend
npm test --prefix frontend
npm run test:ui --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

GitHub Actions runs these checks and the MySQL integration suite. Frontend tests use Node’s test runner, React Testing Library, and jsdom to validate query formatting, multi-select filters, pagination, sorting, details, retries, cancellation, stale-response handling, Summary aggregations, reference tables, and incomplete-data warnings without browser automation. API regression tests use a test database adapter and cover public access, removed account endpoints, import status, CORS behaviour, input validation, database health responses, and retired-route responses. Source-derived fixtures cover historical independents, SMC/GRC contests, multi-party margins, and walkovers; synthetic fixtures cover ties and missing votes. MySQL integration tests exercise actual filters, agreement across APIs, date handling, and rollback after a forced rebuild failure. CI runs these against MySQL 8.4.

To run integration tests locally, start an isolated test database (these sample credentials are disposable test values):

```bash
docker run -d --rm --name election-parity-test \
  -e MYSQL_ROOT_PASSWORD=fixture-only -p 127.0.0.1:3307:3306 mysql:8.4
# Wait until MySQL is ready, then:
TEST_DB_PORT=3307 TEST_DB_PASSWORD=fixture-only npm run test:integration --prefix backend
docker stop election-parity-test
```

The suite creates and drops its own uniquely named database and requires CREATE DATABASE privileges. Never point it at a production server.

The production frontend output is `frontend/dist`. Deployment needs HTTPS, a reverse proxy serving the frontend and forwarding `/api` on one origin, and configured database credentials. Vite's development proxy is not included in the built files. A production deployment is not included in this repository yet.

## Data and project status

Dataset identifiers and boundary-year mappings live in `backend/scripts/sync_data_gov_sg.mjs`. The source is [data.gov.sg](https://data.gov.sg/); retain source attribution when publishing derived views and review the source datasets' usage terms.

The foundation refactor adds environment examples, database initialization, modular API startup, public browsing, data freshness reporting, cancellation of stale map requests, dependency updates, and CI. The React migration is complete. Next is full-stack Docker Compose for the frontend, API, and database. Further improvements include atomic imports, server pagination, map component decomposition, accessibility, and deployment.

**Known limitations:** the full import is not atomic, the search API caps results at 800, and source coverage is incomplete as described above. This is a portfolio project in active refactoring, not a claim of production readiness.
