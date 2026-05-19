# Deploy — Proxmox VM with auto-redeploy

How ProjectProject is hosted on a homelab Proxmox box. The pipeline:

```
push to main
   ↓
GitHub Actions builds two images
   ↓
ghcr.io/<owner>/projectproject-{app,web}:latest
   ↓
Watchtower (on the deploy VM) polls GHCR every 5 minutes
   ↓
docker compose recreates `app` + `web` with the new image
   ↓
nginx-proxy-manager continues to forward your public hostname → `web` :8080
```

No SSH from CI to the homelab. No public ports on the homelab beyond what NPM
already exposes. Image tags are immutable per commit (`sha-<short>`) so
rollbacks are one env var away.

---

## One-time setup

### 1. Create a Proxmox VM

A small Debian / Ubuntu VM is fine. Suggested baseline:

- 2 vCPU
- 2 GB RAM (1 GB works for low load)
- 16 GB disk (more if `data/` will hold many projects)
- Network bridge to your LAN so NPM can reach it

Install Docker + Compose v2. The official `get.docker.com` script is the
fastest path:

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in for the group to apply
```

### 2. Lay out `/srv/projectproject` on the VM

```sh
sudo mkdir -p /srv/projectproject/data
sudo chown -R $USER:$USER /srv/projectproject
```

Then drop in the compose file and the `.env`:

```sh
cd /srv/projectproject
curl -O https://raw.githubusercontent.com/<owner>/projectproject/main/docker-compose.prod.yml
mv docker-compose.prod.yml compose.yaml
# fetch the env template:
curl -O https://raw.githubusercontent.com/<owner>/projectproject/main/.env.production.example
mv .env.production.example .env
```

Edit `.env` and fill in:

- `IMAGE_OWNER` — your GitHub username/org (lowercase).
- `POSTGRES_PASSWORD` — a strong random string.
- `BETTER_AUTH_SECRET` — `openssl rand -hex 32`.
- `BETTER_AUTH_URL` — the public HTTPS URL you'll point at this VM.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from your GitHub OAuth app.
- `GITHUB_APP_WEBHOOK_SECRET` — the secret configured on the GitHub App webhook.
- `BOOTSTRAP_ORG_SLUG` / `BOOTSTRAP_ORG_NAME` — the first organization to create.
- `BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_NAME` / `BOOTSTRAP_OWNER_USERNAME` — the initial owner identity. Use the same email and username as the GitHub account that will sign in.

The GitHub OAuth app's "Authorization callback URL" must be:

```
https://<your-public-host>/api/auth/callback/github
```

The GitHub App webhook URL must be:

```txt
https://<your-public-host>/api/integrations/github/webhook
```

Subscribe the GitHub App webhook to `installation`,
`installation_repositories`, and `pull_request` events.

### 3. First boot

```sh
cd /srv/projectproject
docker compose pull
docker compose up -d
docker compose logs -f app
```

You should see the backend listening on `:3000` (inside the compose network)
and `web` exposing `:8080` on the VM.

### 4. Bootstrap the first organization

ProjectProject does not expose a public "first user creates the org" flow.
After migrations have run, create the configured org and owner membership
from the VM:

```sh
cd /srv/projectproject
docker compose run --rm app bun run bootstrap:org
```

The command is repeat-safe. Re-running it reports the existing org, owner,
and membership instead of creating duplicates. After bootstrap, sign in with
the configured GitHub account.

### 5. nginx-proxy-manager

Add a Proxy Host in NPM:

- **Domain:** `projectproject.example.com`
- **Forward Hostname / IP:** the VM's IP
- **Forward Port:** `8080` (or whatever `WEB_PORT` you chose in `.env`)
- **Block Common Exploits:** on
- **Websockets Support:** off (we don't use them yet)
- **SSL:** Request a Let's Encrypt cert; force SSL.

Set the same Forward Hostname for HTTPS that you put in `BETTER_AUTH_URL`.

### 6. Verify auto-redeploy

Push any change to `main` (e.g. a comment in a README). Within 5–10
minutes, Watchtower pulls the new tag and recreates `app` and `web`. Tail
its logs to confirm:

```sh
docker compose logs -f watchtower
```

---

## Rollback

Image tags include `sha-<short>` for every commit. To pin to an earlier
build:

```sh
# in /srv/projectproject/.env
IMAGE_TAG=sha-abc1234

# then
docker compose up -d
```

Disable Watchtower while pinned, or it'll roll you forward to `latest` on
the next poll:

```sh
docker compose stop watchtower
```

When you want to re-track latest:

```sh
# remove IMAGE_TAG from .env
docker compose up -d
docker compose start watchtower
```

---

## Private image notes

The GitHub Actions workflow pushes to `ghcr.io/<owner>/projectproject-{app,web}`.
Public visibility is per-package:

1. After the first successful CI run, go to your GitHub profile → Packages.
2. For each of `projectproject-app` and `projectproject-web`, open
   _Package settings → Change visibility → Public_.

If you'd rather keep them private, create a Personal Access Token
(`read:packages` scope), and set up Docker auth on the VM:

```sh
echo "<PAT>" | docker login ghcr.io -u <owner> --password-stdin
```

That writes `~/.docker/config.json`. To let Watchtower use the same
credentials, either uncomment the docker-config bind-mount in
`compose.yaml` and copy the file to `/srv/projectproject/docker-config.json`,
or run Watchtower under a user whose `~/.docker/config.json` is the same
file.

---

## Troubleshooting

**The app starts before Postgres is ready.**
The `migrations` service has `depends_on: postgres` with
`condition: service_healthy`. If you see migrations crashing on connect,
inspect Postgres' health: `docker compose ps postgres`.

**Watchtower never picks up new images.**
Check the labels: only services with `com.centurylinklabs.watchtower.enable=true`
are watched (we set this on `app` and `web`). `WATCHTOWER_LABEL_ENABLE`
must be `"true"`. Verify with `docker compose logs watchtower`.

**OAuth callback fails after deploy.**
`BETTER_AUTH_URL` in `.env` must match the public HTTPS hostname _exactly_,
including the scheme (`https://`). The GitHub OAuth app's callback URL must
be `<BETTER_AUTH_URL>/api/auth/callback/github`.

**Migrations keep running on every redeploy.**
That's intended — Drizzle's `migrate` is idempotent. Each migration is
applied once based on its name; subsequent runs no-op.
