# Runbook — ship #153 + #157 to `pp-deploy`

Prepared 2026-09-08, off-host. `pp-deploy` (192.168.68.72) is LAN-only and was
unreachable while writing this, so **every host-specific fact below is a check to
run, not a verified state**. Step 0 exists to settle them before anything mutates.

Host: `ssh pp-deploy` → `wouter@192.168.68.72`, key `~/.ssh/projectproject_deploy`.
Stack root: `/srv/projectproject` (`compose.yaml`, `.env`, `data/`).
Public host: whatever `BETTER_AUTH_URL` says — assumed `https://projectproject.missler.xyz`.
Referred to as `$PP` below; export it once you've confirmed it in step 0.

## Why these two together

They are the two halves of one broken path — MCP client login:

| PR | Layer | Symptom it fixes |
| --- | --- | --- |
| **#153** `fix(deploy): keep nginx application routes in the image` | nginx / frontend image | OAuth discovery returning frontend HTML instead of JSON, because a host-mounted route file shadowed the image's routing |
| **#157** `fix(auth): complete OAuth consent callbacks` | backend | Clicking **Authorize** returns `401 invalid_request`; retrying reloads consent with an empty redirect URL, so the client never receives its authorization code |

Discovery has to return JSON *and* the consent callback has to complete. Shipping
only one leaves MCP login broken, just at a different step.

Neither PR carries a schema migration, so nothing needs a `ticket-index:rebuild`
or a database step. Both are `MERGEABLE/CLEAN`, CI green. Neither has a human
review; CodeRabbit was rate-limited on both, so there are no outstanding review
findings to address — but also no automated second opinion.

## Step 0 — inspect the host (read-only, nothing changes)

The one thing that decides how much work #153 needs: **does this host mount
`app.locations` from disk?** #153's mount migration is written for IGNE, which
terminates TLS *inside* the frontend container. `pp-deploy` terminates TLS at
nginx-proxy-manager and should be using the image's default config untouched —
in which case #153 needs **no host action at all** and Watchtower handles it.
Confirm rather than assume:

```sh
ssh pp-deploy
cd /srv/projectproject

# 1. Is there an override file, and does it mount any nginx config?
ls -la compose.override.yaml compose.override.yml 2>/dev/null
grep -rn "nginx\|app.locations\|certs\|default.conf" compose.yaml compose.override.y*ml 2>/dev/null

# 2. What does the running web container actually have mounted?
docker inspect projectproject-web-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Mode}}){{"\n"}}{{end}}'

# 3. Current images and tags
docker compose images
grep -E "^IMAGE_TAG|^IMAGE_OWNER|^BETTER_AUTH_URL|^WEB_PORT" .env

# 4. Is Watchtower running and tracking latest?
docker compose ps watchtower
docker compose logs --tail=30 watchtower
```

Read the result as:

- **No nginx mounts** (expected) → #153 is a pure image change. Skip step 3b entirely.
- **Mounts `default.conf` and/or `app.locations`** → step 3b applies; treat this
  host the same as IGNE.
- **`IMAGE_TAG` pinned to a `sha-…`** → Watchtower is being held back. You must
  unpin (or bump the pin) in step 3, or nothing rolls forward.

## Step 1 — merge, in this order

#157 is stacked: its base is `fix/oauth-consent-client-name` (#156), not `main`.
Merging #157 first is not possible. #154 is independent of the stack but touches
two of the same files, so land it before the stack to keep the conflicts in one
place.

```
#154  fix/oauth-consent-errors          → main     (touches oauthApplications.ts, oauth.consent.tsx, account.json)
#156  fix/oauth-consent-client-name     → main     (touches oauth.consent.tsx, account.json)
#157  fix/oauth-consent-callback        → #156     (touches oauthApplications.ts + BetterAuth)
#153  fix/nginx-image-routes            → main     (docker/ only — independent, any order)
```

1. Merge **#154**. Overlaps #156 on `oauth.consent.tsx` and `account.json`, and
   #157 on `oauthApplications.ts`.
2. Merge **#156**. GitHub retargets #157 onto `main` automatically once #156 lands.
3. Confirm #157 is now based on `main` and still `MERGEABLE/CLEAN`; rebase it if not.
4. Merge **#157**.
5. Merge **#153**.

If you'd rather not take #154 in this pass: #156 → #157 alone is enough for the
callback fix, but expect a conflict in `oauthApplications.ts` when #154 comes
later, since #157's error handling mirrors it.

```sh
gh pr merge 154 --squash   # then 156, 157, 153
gh pr view 157 --json baseRefName,mergeable,mergeStateStatus
```

## Step 2 — wait for the images

`build.yml` runs on push to `main` and pushes `latest` plus `sha-<short>` for
both `projectproject-app` and `projectproject-web` to GHCR.

```sh
gh run list --workflow=build.yml --limit 5
gh run watch <run-id>
```

Do not touch the host until the run for the **last** merge is green. #153's own
instructions are explicit: never remove the route mount before an image
containing `docker/nginx.locations` exists, because the old image does not
supply that include and nginx will fail to start.

Note the short SHA of that commit — it's your rollback target and your
"did the new image actually land" check.

## Step 3 — roll out

### 3a. Both services (always)

Watchtower polls GHCR every 5 minutes and recreates `app` and `web` (the two
services labeled `com.centurylinklabs.watchtower.enable=true`). On recreation
`migrations` runs first, then `app`. You can simply wait, or force it:

```sh
cd /srv/projectproject
docker compose pull app web
docker compose up -d app web
docker compose logs -f app        # confirm migrations completed, backend on :3000
docker compose images             # confirm the digests moved
```

If step 0 found `IMAGE_TAG` pinned, unpin it in `.env` first (or set it to the
new `sha-…`), otherwise you'll redeploy the old build.

### 3b. nginx mount migration — **only if step 0 found host-mounted nginx config**

Skip this whole section if the web container mounts nothing under `/etc/nginx`.

```sh
cd /srv/projectproject
cp compose.override.yaml compose.override.yaml.bak-$(date +%F)
cp -r nginx nginx.bak-$(date +%F)

# Verify the new image really carries the include before removing the mount
docker compose pull web
docker compose run --rm --no-deps --entrypoint sh web -c 'ls -l /etc/nginx/app.locations'
```

Then remove **only** this volume line from `compose.override.yaml`:

```yaml
- /srv/projectproject/nginx/app.locations:/etc/nginx/app.locations:ro
```

Keep the TLS `default.conf` and certificate mounts. If a host `default.conf` is
mounted, it must still `include /etc/nginx/app.locations;` **inside** its server
block — the include now comes from the image instead of the host.

```sh
docker compose run --rm --no-deps web nginx -t   # validate merged config first
docker compose up -d --no-deps web
docker compose exec web nginx -t
```

Watchtower updates images, not host-mounted files — that's the whole point of
this one-time removal: future route changes travel with the image.

## Step 4 — verify

Discovery must be JSON, not HTML. This is the #153 half:

```sh
export PP=https://projectproject.missler.xyz

curl -sS -D- -o- "$PP/.well-known/oauth-protected-resource/mcp" | head -20
#   expect: 200, content-type: application/json, resource == "$PP/mcp"

curl -sS -D- -o- "$PP/.well-known/oauth-authorization-server" | head -20
#   expect: 200 application/json

curl -sS -o /dev/null -w '%{http_code}\n' "$PP/mcp"
#   expect: 401 (auth challenge), not 200 and not HTML

curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "$PP/"
#   expect: 200 text/html — SPA fallback still intact
```

Then the #157 half, which needs a real client and can't be curl'd end to end —
run a fresh MCP login (Codex or Claude Code) against `$PP`:

1. Client hits `/mcp`, gets the challenge, follows discovery.
2. Consent page loads **with the client's name shown** (that's #156).
3. Click **Authorize** → must redirect back with an authorization code.
   The old failure was `401 invalid_request` here.
4. Client completes a tool call.
5. Open an expired/stale authorization link → should render an explanatory
   message, not a blank redirect (that's #154, if you merged it).

Backend log check while doing the above:

```sh
docker compose logs -f app | grep -iE "oauth|consent|invalid_request"
```

Consent rejections log status and OAuth error code without credentials, so this
is safe to read and paste.

## Step 5 — rollback

Per-commit tags make this cheap. In `/srv/projectproject/.env`:

```sh
IMAGE_TAG=sha-<previous-short-sha>
docker compose up -d
docker compose stop watchtower     # or it rolls you forward on the next poll
```

To re-track: remove `IMAGE_TAG`, `docker compose up -d`, `docker compose start watchtower`.

If you did step 3b and need to go back to an image without the include, restore
the backed-up mount as well — the older image has no `/etc/nginx/app.locations`,
and nginx will refuse to start with a dangling `include`.

## Decisions left to you

1. **Include #154?** Recommended — it's the same error-handling surface, and
   splitting it just books a future conflict in `oauthApplications.ts`.
2. **#152's env tunables.** Not part of this rollout, but when the T-118 stack
   lands, `TICKET_INDEX_PUBLISH_RETRY_BASE` (50ms), `_BUDGET` (1s) and
   `TICKET_INDEX_REPAIR_INTERVAL` (5s) are the author's admitted guesses and
   want values chosen against this deployment's actual DB behaviour.
3. **#153 mentions `pp.igne.nl` needs the same migration.** Out of scope here —
   this runbook only covers `pp-deploy`.
