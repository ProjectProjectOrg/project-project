# Exercise 1 — Postgres in docker compose

**Files involved:** `docker-compose.yml` (already written), `.env.example` (already written), `.env` (you'll create).

## Goal

Get a local Postgres running on port 5432, with credentials matching the `DATABASE_URL` your backend will read from `.env`. Confirm you can connect to it from outside the container.

## Concepts practiced

- Docker compose for local-dev infra
- The `.env` / `.env.example` split — committed defaults vs. uncommitted secrets
- Bun's automatic `.env` loading
- Postgres healthchecks (so later chapters can wait for the DB to be ready before running migrations)

## Steps

1. **Verify Docker is installed and running.** From a terminal: `docker --version` and `docker compose version`. If both work, you're set. If not, install Docker Desktop (Windows/macOS) or `docker` + `docker-compose-plugin` (Linux). Make sure the Docker daemon is actually running — on Windows that means Docker Desktop is in the system tray.
2. **Create your local `.env` file** by copying `.env.example`:
   ```sh
   cp .env.example .env
   ```
   (On Windows PowerShell: `Copy-Item .env.example .env`.)
3. **Start Postgres** from the repo root:
   ```sh
   docker compose up -d
   ```
   The `-d` runs it in the background. The first run pulls the `postgres:16-alpine` image (~80 MB).
4. **Watch it become healthy:**
   ```sh
   docker compose ps
   ```
   You're looking for `STATUS  Up X seconds (healthy)`. The healthcheck in `docker-compose.yml` polls `pg_isready` every 5 seconds; "healthy" means the connection check passed.
5. **Connect to it** and run a trivial query, just to prove the credentials work:
   ```sh
   docker compose exec postgres psql -U projectproject -d projectproject -c "SELECT version();"
   ```
   You should see Postgres 16's version string.

## Acceptance criteria

- [ ] `docker compose ps` shows `projectproject-postgres` with status `Up` and `healthy`.
- [ ] The `psql -c "SELECT version();"` command above prints a row.
- [ ] `.env` exists at the repo root, contains `DATABASE_URL=...`, and is gitignored (already covered by the existing `.gitignore`).
- [ ] Stopping the container with `docker compose down` and starting it again with `docker compose up -d` preserves the data (the `postgres_data` volume persists across restarts). You can verify by creating a throwaway table, restarting, and confirming it's still there. `docker compose down -v` is the "wipe everything" version.

## Hints

<details>
<summary>Hint 1 — what if port 5432 is already in use?</summary>

You probably have another Postgres running locally. Either stop it, or change the host-side port mapping in `docker-compose.yml`:

```yaml
ports:
  - "5433:5432"
```

…and update `DATABASE_URL` in `.env` to use port `5433`. The container-side port stays `5432` regardless.

</details>

<details>
<summary>Hint 2 — connecting from outside Docker (e.g. a GUI tool like TablePlus, DBeaver, pgAdmin)</summary>

Same connection string, just split out:

- Host: `localhost`
- Port: `5432`
- User: `projectproject`
- Password: `projectproject_dev`
- Database: `projectproject`

`localhost` works because the container exposes port 5432 to your host. Inside another container on the same compose network (which we'll have once we add the app container in a later chapter), the host would be `postgres` (the service name), not `localhost`.

</details>

<details>
<summary>Hint 3 — the data volume</summary>

`docker compose down` stops and removes the container but keeps the named volume (`postgres_data`). `docker compose down -v` also removes the volume — useful when you want to start from scratch (e.g. after a bad migration). On Windows the volume lives inside the WSL2-backed Docker VM; you don't need to find it on disk, just trust that `down -v` resets it.

</details>

<details>
<summary>Hint 4a — Windows + Docker Desktop: use <code>host.docker.internal</code>, not <code>localhost</code></summary>

If you're on Windows and your `DATABASE_URL` uses `localhost`, you'll likely hit a confusing `28P01 password authentication failed` from any non-`psql` client (Bun + `pg`, Bun's native `SQL`, etc.) even though the password is correct.

Cause: Docker Desktop's port-forwarding proxy on Windows corrupts the SCRAM-SHA-256 handshake bytes on the `localhost:5432` path. The `host.docker.internal` alias routes through a different mechanism and works fine. macOS Docker Desktop accepts both as aliases for the host; on native Linux without Docker Desktop, use `localhost`.

Fix: in `.env`, change

```
DATABASE_URL=postgres://...@localhost:5432/...
```

to

```
DATABASE_URL=postgres://...@host.docker.internal:5432/...
```

You can confirm with a quick Bun + pg test before debugging anything else:

```sh
cd packages/backend
bun --env-file=../../.env -e "import { Client } from 'pg'; const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); console.log('ok'); await c.end()"
```

</details>

<details>
<summary>Hint 4b — "auth failed" / Postgres error 28P01 from outside the container</summary>

Symptom: `psql` from _inside_ the container works (`docker compose exec postgres psql -U projectproject ...`), but any external TCP connection (including drizzle-kit) fails with `28P01 / invalid password`.

Cause: the `postgres_data` volume was initialized with different credentials by a previous run. Postgres only applies `POSTGRES_USER` / `POSTGRES_PASSWORD` env vars on the **first** init when the data directory is empty. If anything later changes those env vars, Postgres ignores them and keeps using whatever's in the existing data dir.

Fix: wipe the volume and reinitialize.

```sh
docker compose down -v
docker compose up -d
```

If that's not safe (you have data you want to keep), connect as the existing superuser via `docker compose exec` and `ALTER USER projectproject WITH PASSWORD 'projectproject_dev';` manually.

</details>
