# Singapore Election Explorer

Explore Singapore's general election results through interactive constituency maps, historical comparisons, and party-level vote breakdowns. Open the explorer directly—no account or sign-in required.

Built with **React · Leaflet · Express · MySQL**. The legacy Python Dash/Plotly dashboard is retained temporarily for migration verification. Originally developed as an academic project, now being refactored into a maintainable portfolio application.

## What it does

- **Explore the map:** switch between boundary years, filter by constituency type or party, and inspect constituency results.
- **Compare elections:** search historical results by year, constituency, contesting party, and winner.
- **Inspect the details:** view candidates, vote shares, winning margins, and elector statistics.
- **Visualize trends:** use the Plotly dashboard for constituency wins and historical comparisons.
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
Browser → Vite / React (5173)
              ├── /api/*  → Express (4000) → MySQL (3306)
              └── /dash/* → Express proxy → Dash (8050)
                                                      └── Express API → MySQL

data.gov.sg → manual import script → MySQL
```

Both Search and Summary are implemented in React. Summary includes party-win rankings, yearly constituency-win comparisons, an exact-count table, and searchable/sortable election-date and party references. The original Dash dashboard remains available at `/dash/` for migration comparisons; normal browsing no longer embeds it.

The frontend uses relative URLs. Vite proxies the API and optional legacy dashboard through one browser origin. Express owns the public read-only election API and shared database pool; Dash calls the same API without a session. The Python service binds to loopback and should remain private.

```text
backend/     Express app, routes, controllers, import scripts, API tests
frontend/    React pages, data freshness, Leaflet map, styling
dash/        Python dashboard and Plotly charts
db/          Initial MySQL schema
docs/        Refactoring roadmap and screenshot assets
```

## Run locally

### Prerequisites

- Node.js 24 (or Node.js 22.12+) and npm; `.nvmrc` selects Node.js 24.
- Python 3.11 and `venv`.
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
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r dash/requirements.txt

cp .env.example .env
cp backend/.env.example backend/.env
```

On Windows, activate Python with `.venv\Scripts\Activate.ps1` in PowerShell instead.

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

### 3. Start the three application services

Run the API and frontend from the repository root in separate terminals. The Python service is optional for normal browsing and is retained for legacy comparisons:

```bash
# Terminal 1 — API
npm run dev --prefix backend
```

```bash
# Optional — legacy dashboard for comparison
source .venv/bin/activate
python dash/app.py
```

```bash
# Terminal 3 — frontend
npm run dev --prefix frontend
```

Open **http://localhost:5173** to go directly to the Dashboard. Switch to Map using the navigation. Check database connectivity at **http://localhost:4000/api/health**.

Stop each development server with `Ctrl+C`. `docker compose stop` stops MySQL while preserving its data.

### Troubleshooting

- **API unavailable:** check `backend/.env`, MySQL health, and whether ports 3306/4000 are already occupied.
- **Empty map or dashboard:** confirm the data import completed; an empty database has no results to display.
- **Legacy dashboard unavailable:** optionally start `python dash/app.py` and check port 8050. React Search and Summary do not need this service.

## Data refresh and freshness

Refresh is a maintainer operation: run `npm run sync:data --prefix backend`. There is no public refresh button or import endpoint. Browsing and filtering only query MySQL; they do not trigger imports.

The header links to data.gov.sg and shows **Data last updated**, meaning the last completed local import, in Singapore time. It is not the publisher's update date. A fresh or older database without an import record shows no completed import; running and failed imports are explicitly indicated. Since the importer is not yet atomic, a failed import may leave partial data even when an older successful timestamp exists. Status is checked once a minute.

## Start from VS Code

Open this folder in VS Code. Use **Terminal → Run Task → Explorer: database**, wait for MySQL to become healthy, then run **Explorer: start app** to launch the API, dashboard, and frontend in dedicated terminals. Install dependencies and configure the environment first using the instructions above. Stop any existing servers on ports 4000, 8050, and 5173 before starting another copy. The Python task uses the macOS/Linux `.venv/bin/python` path.

## Development checks

```bash
npm test --prefix backend
npm test --prefix frontend
npm run test:ui --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
python -m py_compile dash/app.py
python -m unittest discover -s dash -p 'test_*.py'
```

GitHub Actions runs these checks, a Dash page smoke test, and a cross-language chart-count comparison against legacy Dash using fixtures. Frontend tests use Node’s test runner, React Testing Library, and jsdom to validate query formatting, multi-select filters, pagination, sorting, details, retries, cancellation, stale-response handling, Summary aggregations, reference tables, and incomplete-data warnings without browser automation. API regression tests use a test database adapter and cover public access, removed account endpoints, import status, origin checks, input validation, database health responses, and Dash callback forwarding. They do not replace full MySQL integration tests or a source-data correctness audit.

The production frontend output is `frontend/dist`. Deployment needs HTTPS, a reverse proxy serving the frontend and forwarding `/api` on one origin, and configured database credentials. Vite's development proxy is not included in the built files. If retaining the legacy dashboard, also proxy `/dash` to a private Python service. A production deployment is not included in this repository yet.

## Data and project status

Dataset identifiers and boundary-year mappings live in `backend/scripts/sync_data_gov_sg.mjs`. The source is [data.gov.sg](https://data.gov.sg/); retain source attribution when publishing derived views and review the source datasets' usage terms.

The foundation refactor adds environment examples, database initialization, modular API startup, public browsing, data freshness reporting, cancellation of stale map requests, dependency updates, and CI. Planned improvements include import correctness, component decomposition, browser tests, accessibility, and deployment.

**Known limitations:** the import is not atomic, and the dashboard proxy has unresolved transitive dependency advisories. This is a portfolio project in active refactoring, not a claim of production readiness.
