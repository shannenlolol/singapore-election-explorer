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
Browser → nginx / React (8080) → /api/* → Express (4000) → MySQL (3306)

data.gov.sg → explicit maintainer import → MySQL
```

Search, Summary, and Map run in one React application. nginx serves the built frontend and forwards `/api` to Express on the same origin. Only the frontend is published to the host, on loopback. The API and database communicate over Docker networks; the database network is internal. API and frontend processes run as non-root users.

```text
backend/     Express API, calculations, import scripts, tests, Dockerfile
frontend/    React dashboard and map, nginx config, Dockerfile
db/          MySQL initialization schema and account-removal migration
docs/        Screenshot assets
```

## Run with Docker Compose

Requires Docker with Compose v2 supporting `up --wait`. Host Node.js is only needed for local development.

```bash
git clone https://github.com/shannenlolol/singapore-election-explorer.git
cd singapore-election-explorer
cp .env.example .env
```

Set `MYSQL_ROOT_PASSWORD` and `DB_PASSWORD` in `.env` to your own local passwords. `WEB_PORT` defaults to `8080`; `DGS_API_KEY` is optional. Compose supplies database settings directly to the API; `backend/.env` is not needed for this workflow. Local environment files and dependencies are excluded from Docker build contexts.

```bash
docker compose up -d --build --wait
# A new database starts empty. Import public data explicitly:
docker compose run --rm api npm run sync:data
```

Open **http://localhost:8080** (or your `WEB_PORT`). The import can take several minutes and requires internet access. Browsing only queries MySQL; restarts never download or import data automatically.

MySQL must pass a database query before the API starts, and the API must pass its database-backed health check before nginx starts. nginx also has its own static health check. See [Compose startup ordering](https://docs.docker.com/compose/how-tos/startup-order/) for the health dependency behaviour. An unhealthy service is reported as unhealthy; health failure alone does not automatically restart it.

Useful commands:

```bash
docker compose ps
docker compose logs -f api frontend
# Recalculate summaries from existing data, without downloading:
docker compose run --rm api npm run rebuild:summary
# Stop while retaining data:
docker compose stop
# Resume:
docker compose up -d --wait
# Rebuild after code changes:
docker compose up -d --build --wait
```

The named `mysql_data` volume persists across container recreation and `docker compose down`. **`docker compose down --volumes` deletes the database.** Keep the same project/folder name to reuse the existing volume. Changing a password in `.env` does not change a MySQL user already stored in that volume.

### Existing databases

The existing `mysql_data` volume is retained when upgrading this repository. Initialization runs only for a new volume. To add missing tables to an older database without deleting data:

```bash
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" election_db' < db/schema.sql
```

For installations that still contain the old accounts table:

```bash
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" election_db' < db/migrations/001-remove-accounts.sql
```

The migration deletes unused account records. The schema creates missing tables; it is not a versioned migration system and does not alter incompatible existing columns.

## Local development with hot reload

Use Node.js 24 and npm, with only MySQL in Docker. Configure the root `.env` as described above first:

```bash
npm ci --prefix backend
npm ci --prefix frontend
cp backend/.env.example backend/.env
# Use the same DB_PASSWORD as the root .env file.
# If switching from the full stack, stop its API/frontend first:
docker compose stop api frontend
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait mysql
```

The development override publishes MySQL on `127.0.0.1:3306`. If you change `DB_PUBLISHED_PORT` in the root `.env`, match `DB_PORT` in `backend/.env`.

```bash
# Terminal 1 — API
npm run dev --prefix backend
```

```bash
# Terminal 2 — Vite frontend
npm run dev --prefix frontend
```

Open **http://localhost:5173**. Vite forwards `/api` to the local API on port 4000. Maintainers can import with `npm run sync:data --prefix backend`. Stop Node/Vite with `Ctrl+C` before switching workflows. Starting the full-stack Compose configuration again removes the development database port mapping.

### Troubleshooting

- **CARTO watermark in Simple map:** set `VITE_CARTO_BASEMAP_API_KEY` in the root `.env` for Docker, then run `docker compose up -d --build --no-deps frontend`. For Vite development, set it in `frontend/.env.local` and restart Vite. Request a [CARTO Basemaps key](https://www.carto.com/basemaps/apikey/) and configure website restrictions for your host. This browser-visible key is embedded at build time; restarting a container alone does not update it. Hard-refresh the page after rebuilding.
- **Unhealthy API/database:** use `docker compose ps` and `docker compose logs api mysql`; verify credentials match the existing volume.
- **Empty results:** a new database needs the explicit import command. Check the import output if it fails.
- **Port already in use:** change `WEB_PORT` for Docker or stop the existing local process. MySQL is published only by the development override.
- **Source requests fail:** imports require outbound internet access and may encounter data.gov.sg rate limits. The importer records failure; see the data limitations below before retrying.

## Data refresh and freshness

Refresh is a maintainer operation: run `docker compose run --rm api npm run sync:data` (or `npm run sync:data --prefix backend` in local development). There is no public refresh button or import endpoint. Browsing and filtering only query MySQL; they do not trigger imports.

The header links to data.gov.sg and shows **Data last updated**, meaning the last completed local import, in Singapore time. It is not the publisher's update date. A fresh or older database without an import record shows no completed import; running and failed imports are explicitly indicated. Since the importer is not yet atomic, a failed import may leave partial data even when an older successful timestamp exists. Status is checked once a minute.

### Correcting existing derived results

After updating from an older checkout, recalculate summaries without downloading data:

```bash
docker compose run --rm api npm run rebuild:summary
# Local development alternative: npm run rebuild:summary --prefix backend
```

This corrects historical independent-candidate rankings and turnout calculations. Both derived tables are replaced in one transaction; a failure preserves the previous summaries. Source records are unchanged, and this local recalculation does not advance the last-import timestamp. Future imports use the same calculations automatically. Stop any concurrent import before rebuilding.

### Calculation and coverage rules

- Each source row is one contestant: an individual candidate or a whole GRC team. Winners and margins compare contestants, so separate independents are never added together to determine a winner.
- Margin is the difference between the top two contestants divided by total valid votes, expressed in percentage points. Details expose fractional vote shares; the UI displays percentages. Map party shares are grouped, but its winner and shading use the winning contestant.
- Turnout is `(valid votes + rejected votes) / registered electors × 100`. Spoilt papers are cancelled/replaced and excluded, consistent with [ELD’s polling explanation](https://www.eld.gov.sg/candidate_parliamentary_polling.html). Missing inputs produce unavailable turnout.
- A sole contestant with no vote total is treated as an uncontested return, following the historical source convention. Vote shares, margin, and turnout remain unavailable. Tied totals do not imply a winner; incomplete totals do not imply zero votes.
- The [results dataset](https://data.gov.sg/datasets/d_581a30bee57fa7d8383d6bc94739ad00/view) inspected on 7 October 2026 contains 753 constituency/year records, including only 33 for 2025: it omits the Marine Parade walkover. The app does not invent missing records. Charts count available constituencies, **not seats or a complete official tally**.
- Search currently returns at most 800 results; Search and Summary warn when that limit is reached. Server pagination and complete import publication remain follow-up work.

## Data and project status

Dataset identifiers and boundary-year mappings live in `backend/scripts/sync_data_gov_sg.mjs`. The source is [data.gov.sg](https://data.gov.sg/); retain source attribution when publishing derived views and review the source datasets' usage terms.

**Known limitations:** the full import is not atomic, the search API caps results at 800, and source coverage is incomplete as described above. This is a portfolio project in active refactoring, not a claim of production readiness.
