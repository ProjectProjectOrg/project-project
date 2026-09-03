# Alchemy for deploy + self-hosting — evaluation

Assessment of whether [Alchemy](https://alchemy.run) should replace parts of the
deploy path described in `docs/deploy.md`. Nothing is adopted yet — this is the
decision material.

## What Alchemy is (as of `2.0.0-beta.76`)

TypeScript IaC. v2 is a ground-up rewrite branded "Infrastructure as Effects":
resources are Effects, providers are Layers, secrets are `Redacted`, config is
`effect/Config`. The v1 async/await line (`0.94.0`, now the `alchemy-async` repo)
is a different product with a migration guide between them.

CLI is `alchemy plan | deploy | destroy | dev | state`. State is keyed by
stack + stage and persisted locally in `.alchemy/`, in a Cloudflare Worker, or in
Postgres. Stages (`prod`, `staging`, `pr-42`) are first-class and isolated.

Providers relevant to us: **Docker** (Image, RemoteImage, Container, Network,
Volume, Service, Swarm, **Context**), **GitHub** (Repository, Secret, Variable,
Environment, Webhook, Comment), **AWS** (S3 among everything else), **Cloudflare**
(R2), **Hetzner**, **Fly**, **Railway**, **Neon/PlanetScale**, **Command** (build,
exec, dev), **SQL** (Drizzle schema + migrations in the deploy graph).

## What actually hurts today

Reading `docs/deploy.md` and `docker-compose.prod.yml`, the problems are:

1. **A deploy is not an event.** Watchtower polls GHCR every 5 minutes and swaps
   the container. There is no commit→live correlation, no health gate before the
   old container is gone, and rollback is "SSH in, edit `.env`, stop Watchtower".
2. **The VM's `/srv/projectproject/.env` is the real source of truth and it is
   untracked.** ~18 variables, hand-edited. Drift from `.env.production.example`
   is invisible until something 500s.
3. **First-time setup is a seven-step manual runbook** — GitHub OAuth app, GitHub
   App (3 URLs, 3 event subscriptions, a private key), nginx-proxy-manager host,
   GHCR package visibility, two bootstrap scripts.
4. **The compose file lives in the repo but runs from a hand-copied copy on the
   VM.** Changing topology means SSH + re-curl.
5. **No staging and no preview envs.** `main` is the only environment.

## Where Alchemy genuinely helps

### Push deploys to the Proxmox VM, replacing Watchtower

`Docker.Context` points the Docker resources at a remote engine over SSH, and
every Docker resource takes a `context` prop:

```ts
const vps = yield* Docker.Context("vps", { docker: "host=ssh://deploy@vm" });
const net = yield* Docker.Network("app-net", { context: vps });
const app = yield* Docker.Container("app", { context: vps, image, healthcheck: {...} });
```

That converts the compose topology into typed TS in the repo and gives us
`alchemy plan` (a reviewable diff before anything moves), ordered convergence
with healthchecks, and `alchemy destroy`. Watchtower and the copied compose file
both go away, and a deploy becomes a thing that happens at a known commit.

`Docker.Image` builds from our existing Dockerfiles and pushes to GHCR with
`registry: { server, username, password: Config.redacted("GITHUB_TOKEN") }`. It
never runs `docker login` and never touches the global docker config. Its diff is
literally `docker build` compared by image id, memoized so plan+deploy build once.

**The catch:** this needs an SSH path to the homelab, which `deploy.md` currently
and deliberately avoids ("No SSH from CI to the homelab"). Options are a
self-hosted runner on the LAN, a Tailscale step in the workflow, or running
`alchemy deploy` from a workstation. That tradeoff is the crux of this decision,
not Alchemy itself.

### The S3 bucket, before it exists

`docs/PROJECTPROJECT.md:1001` leaves attachments open. `AWS.S3.Bucket` (or
`Cloudflare.R2.Bucket`) declared in the stack, with the IAM policy minted from the
binding, means that feature never acquires a manual "create a bucket, create an
IAM user, paste the keys" step. This is the cleanest win available because there
is nothing to migrate — it is greenfield.

### Config and secrets stop being a README table

`effect/Config` + `Redacted` for the ~18 variables, `Alchemy.makeRandom` for
`BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` instead of "run `openssl rand -hex 32`
and paste it", and `GitHub.Secret`/`GitHub.Variable` so CI credentials are
declared in the repo rather than pasted into repo settings. A missing variable
becomes a typecheck failure instead of a runtime 500.

### Postgres state store

We already run Postgres. Alchemy documents a Postgres-backed state store, so
adopting it does not drag in a Cloudflare account or a checked-in state file.

### It is Effect

The backend is Effect v3 throughout. Layers, `Config`, `Redacted`, tagged errors —
the deploy program would read like the rest of the codebase. That alignment is
real and rare, and it is the strongest non-functional argument here.

## Where it does not help

### It will not create the GitHub App

The GitHub provider has Repository, Secret, Variable, Environment, Webhook and
Comment. There is **no App resource** — and that is a GitHub constraint, not an
Alchemy gap. Registering an App requires either the browser form or the App
Manifest flow, and the private key is generated once and downloadable once.

So the step we most want to delete does not get deleted. What Alchemy can do is
take the resulting credentials and place them (Actions secrets, container env),
and manage the per-repo `GitHub.Webhook`.

If the goal is for a self-hoster to never hand-register an App, the actual answer
is the **GitHub App Manifest flow inside our own setup wizard**: POST a manifest
to `/settings/apps/new?state=…`, GitHub redirects back with a code, exchange it at
`/app-manifests/{code}/conversions` and receive the app id, PEM, webhook secret and
client credentials in one response. That is in-app UI — the thing this evaluation
was meant to route around. Worth deciding on its own merits.

### No Proxmox, no nginx-proxy-manager

VM lifecycle and the reverse proxy stay manual. Alchemy's VM story is Hetzner
(API-provisioned cloud servers running Effect programs as systemd units), which is
a different hosting decision, not a drop-in for a homelab box.

### It may make third-party self-hosting worse

This is the part to be careful about. Alchemy is deployer-side tooling. If
ProjectProject is meant to be self-hostable by other people, "install Bun, point a
Docker context at your box, run `alchemy deploy`" is a heavier ask than
`docker compose up`. Alchemy would improve **our** cadence a lot; it would not
obviously improve a stranger's install.

The resolution is probably that the two audiences get different paths: Alchemy
internally, compose as the supported public route. But that means maintaining both,
and the compose file stops being the thing we ourselves run — which is exactly how
published install instructions rot.

## Maturity risk

`2.0.0-beta.76`. The docs are overwhelmingly Cloudflare and AWS; Docker is a
comparatively thin section (four guide pages). The path we need — Docker resources
driven through a remote SSH context against a long-lived stateful box — is the
least-trodden route through a beta rewrite. We would be the ones finding the bugs.

Two specific hazards in the Docker provider:

- Most prop changes on `Network`, `Volume` and `Container` are **replacements**
  (delete-first). For `postgres_data` that is a data-loss shape unless the volume's
  props are treated as frozen.
- A same-name pre-existing container/network/volume without Alchemy labels surfaces
  as `Unowned` and **fails the deploy**. Taking over the running stack needs the
  documented `--adopt` path or a deliberate recreate with a database dump in hand.

## Recommendation

Adopt in the shallow end, keep compose running the show for now.

- **Do**: put the future S3/R2 bucket and its credentials in an Alchemy stack, and
  move the GitHub Actions secrets/variables into `GitHub.Secret`/`GitHub.Variable`.
  Both are additive, neither can take production down, and they give us a real read
  on whether the beta is pleasant to live with.
- **Not yet**: replacing compose + Watchtower on the Proxmox VM. The win is genuine
  (deploys become events, `plan` before apply, health-gated rollout) but it is
  gated on an SSH path to the homelab we chose not to have, and on trusting a beta
  Docker provider with the Postgres volume.
- **Decide separately**: the GitHub App manifest wizard. It is the biggest actual
  reduction in setup friction and Alchemy is irrelevant to it.

## Open questions

1. Is a self-hosted runner or Tailscale in CI acceptable, or does "no inbound path
   to the homelab" stay a hard rule?
2. Is third-party self-hosting a real goal, or is `deploy.md` documentation for us?
   The answer changes whether compose has to survive.
3. Attachments: S3, R2, or the filesystem next to the markdown tree? Alchemy only
   pays off here if it is object storage.
