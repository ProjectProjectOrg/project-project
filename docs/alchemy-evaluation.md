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

## Alchemy as the self-host installer

Third-party self-hosting is the goal, so the question is not "does Alchemy
improve our cadence" but "is an Alchemy stack a better thing to hand a stranger
than a compose file". Worth taking seriously — it might be.

### What a self-hoster does today

Seven steps in `docs/deploy.md`: provision a VM, install Docker, copy the compose
file and `.env` and fill ~18 variables (two of which are "run `openssl rand -hex 32`
and paste the result"), `docker compose up`, `docker compose run --rm app bun run
ticket-index:rebuild`, `docker compose run --rm app bun run bootstrap:org`,
configure nginx-proxy-manager, and register a GitHub OAuth app plus a GitHub App
with three URLs and three event subscriptions.

### What it could become

```
git clone && bun install
cp .env.example .env      # hostname, admin email, and little else
bun alchemy deploy
open https://host/setup   # click "Create GitHub App"
```

The mechanics that get us there:

- **`Docker.Context` makes local and remote the same stack.** One env var decides
  whether the target is the machine they are sitting at or a VPS they own over
  SSH. No forked instructions, no second document. Note that the SSH concern that
  applies to *our* homelab does not apply here at all — it is their box and their
  key, initiated from their shell.
- **`Alchemy.makeRandom` deletes the paste-a-secret steps.** `BETTER_AUTH_SECRET`
  and `POSTGRES_PASSWORD` get generated and held stable in state. Two variables
  they can no longer get wrong.
- **`RemoteImage` means they never build.** They pull our published GHCR images;
  no build context, no registry credentials, no 10-minute first boot.
- **The three post-install commands collapse into the deploy graph.** Migrations,
  `ticket-index:rebuild` and `bootstrap:org` become ordered nodes that run in one
  `alchemy deploy` instead of three copy-pasted `docker compose run` invocations.
  This is the single biggest reduction in the runbook.
- **Object storage becomes a choice in one file.** R2, S3, or a MinIO container
  for people who want nothing cloud-side — all three expressible in the same
  program. Compose can only express the third.
- **Upgrades get a diff.** `git pull && bun alchemy plan` shows that the upgrade
  replaces two containers and runs three migrations *before* it happens.
  Watchtower gives an operator none of that.
- **`alchemy destroy` is a clean uninstall**, including the cloud-side bucket.

### What it costs them

- **A toolchain where there wasn't one.** Bun plus a repo clone, versus
  `curl compose.yaml && docker compose up`. The NAS/Unraid/Portainer crowd is a
  large slice of self-hosters and they expect a compose file they can paste into a
  UI. We would be filtering them out.
- **`.alchemy/` becomes state the operator must not lose.** Lose it and the next
  deploy sees the running containers as `Unowned` and fails. Compose has no
  equivalent failure mode, and this one lands hardest on the least-expert users.
  The Postgres state store is chicken-and-egg here since Postgres is itself in the
  stack, so it would be local state plus a documented `--adopt` recovery.
- **Debuggability collapses.** Every self-hoster already knows `docker compose logs`.
  When an Alchemy deploy fails they are debugging a TypeScript program and a state
  file, and the pool of people who can help them is currently tiny.
- **Beta software in a stranger's install path.** Breaking changes between
  `beta.76` and 2.0 land on them, not on us.

### The honest framing

Look at where the seven steps actually hurt. Steps 4-6 (compose up, rebuild index,
bootstrap org) are mechanical and Alchemy genuinely collapses them. Steps 7 and the
GitHub App registration are where people actually bounce — and **Alchemy does
nothing for either**. The App has to be registered in a browser, and the reverse
proxy is not a resource in any provider we would use.

So the largest available reduction in self-host friction is the setup wizard
(manifest flow for the App, generated secrets, a Caddy container doing its own ACME
so nginx-proxy-manager stops being a prerequisite) — and none of that requires
Alchemy. Alchemy is a real improvement to the middle of the runbook, not to the
parts that lose people.

### If we do adopt it for self-hosting

Keep a compose file as the floor, and **generate it from the Alchemy stack** so the
two cannot drift — the stack is the source of truth, `docker-compose.prod.yml`
becomes a build artifact checked in for the paste-it-into-Portainer path. Alchemy
ships no compose emitter, so that is bespoke work on our side; it is the only way I
can see to serve both audiences without maintaining two hand-written descriptions
of the same topology.

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

Adopt in the shallow end, and treat the self-hosting question as a design
question that Alchemy only partly answers.

- **Do now**: the attachments bucket (R2 or S3, per the decision already made) and
  the GitHub Actions secrets/variables as `GitHub.Secret`/`GitHub.Variable`. Both
  are additive, neither can take production down, and they tell us whether the beta
  is pleasant to live with before anything depends on it.
- **Prototype next**: a self-host stack that collapses migrations, index rebuild
  and org bootstrap into one `alchemy deploy` against a `Docker.Context`. That is
  the part with real payoff for third parties. Prove it locally before it goes near
  the homelab.
- **Not yet**: replacing compose + Watchtower on our Proxmox VM. Gated on the SSH
  question below and on trusting a beta Docker provider with `postgres_data`.
- **Independent of Alchemy, and probably higher leverage**: the setup wizard —
  GitHub App manifest flow, generated secrets, and a Caddy container that does its
  own ACME. That deletes the steps where self-hosters actually give up.

## Appendix: the SSH question, in full

Today CI builds images and pushes them to GHCR, and the VM *pulls*. Nothing outside
the LAN can initiate a connection to the homelab — `deploy.md` states this as a
deliberate property ("No SSH from CI to the homelab").

Alchemy's Docker provider works by shelling out to the `docker` CLI against a
context. For GitHub Actions to converge containers on the VM, the runner has to
*reach* the VM. That is a push model, and it is what the current design avoids.
Hence the question. The options, and what each actually costs:

1. **Keep it pull-based.** Network posture unchanged. But Alchemy then cannot manage
   the VM's containers from CI at all — Watchtower stays, and we keep zero
   plan/diff/health-gating on the rollout itself. Alchemy would be limited to
   build/push plus cloud-side resources.
2. **Tailscale in the workflow.** `tailscale/github-action` joins the runner to the
   tailnet as an ephemeral node; the VM is reachable at its tailnet address, and the
   Docker context becomes `ssh://deploy@<tailnet-name>`. No ports opened to the
   internet and no NPM change. Cost: an auth key in Actions secrets, and a
   GitHub-hosted runner is transiently on your network. This is the conventional
   answer and the one I would pick.
3. **Self-hosted runner on the LAN.** The runner polls GitHub outbound, so there is
   still no inbound path — strongest posture of the three. Cost: a runner to patch,
   and a box on your LAN that executes workflow code from the repo.
4. **Deploy from a workstation.** `alchemy deploy` over LAN SSH by hand. Zero
   infrastructure, and you still get `plan` and health gates. Cost: merging no
   longer deploys, so cadence depends on someone being at the desk.

Worth repeating: **this constraint is ours alone.** A self-hoster running
`alchemy deploy` from their own shell against their own machine never encounters it.

## Open questions

1. Which of the four options in the appendix do we want for the homelab? Tailscale
   is my recommendation; it is the smallest change that unlocks push deploys.
2. Do we accept generating `docker-compose.prod.yml` from the stack, or does compose
   stay hand-written and authoritative for self-hosters?
3. R2 or S3 for attachments? R2 has no egress fees and a self-hoster can point the
   same S3-compatible client at MinIO; S3 is the more familiar default.
