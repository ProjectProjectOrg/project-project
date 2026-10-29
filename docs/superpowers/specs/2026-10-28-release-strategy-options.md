# Release strategy for ProjectProject — options and recommendation

Status: option B accepted. Workflows live in `.github/workflows/{ci,nightly,stable}.yml`; cadence is driven by the `NIGHTLY_MIN_GAP_HOURS` and `STABLE_MIN_SOAK_HOURS` repository variables. Versions are calendar based (`vYYYY.M.D`, `.2` for a second release from the same build day) instead of semantic versioning, so stable needs no version input and nothing is committed back to `main`; see `docs/deploy.md`. Instance-side puller still to be decided.

## Where we are

- `build.yml` pushes `projectproject-{app,web}` to GHCR on every push to `main`, tagged `latest` and `sha-<short>`.
- `ci.yml` runs check, tests and build on the same push, in parallel with `build.yml`. The image build does not wait for CI, so a red `main` still ships.
- Both instances (homelab Proxmox, `pp.igne.nl` on DigitalOcean) run Watchtower polling `latest` every 5 minutes. Every merge reaches production within minutes. Recent weeks saw 20–90 commits a day on `main`.
- Watchtower recreates `app` and `web` as separate containers; between the two recreations the frontend and API can be from different commits.
- `containrrr/watchtower` was archived in December 2025. Maintained alternatives: the `nicholas-fedor/watchtower` fork (drop-in), What's Up Docker, Diun (notify only), Komodo (full fleet manager).
- `APP_VERSION` is baked into the backend image as `sha-<fullsha>` and only read by feedback config. Nothing in the UI shows what is running. The repo has no tags and no GitHub Releases.
- Rollback is `IMAGE_TAG=sha-… docker compose up -d` with Watchtower stopped. Migrations are forward only, so a rollback across a migration is not safe today.

## What T3 Code does

Distilled from `.github/workflows/release.yml`, `.github/scripts/check-nightly-release.cjs`, `scripts/resolve-nightly-release.ts` and `docs/operations/release.md` in `pingdotgg/t3code`:

1. **Three channels.** `nightly` is automatic, `stable` is manual, `preview` is a manual test train that nothing resolves by default.
2. **Nightly is gated, not every push.** A cron runs every 30 minutes but only publishes when `main` has new commits since the last nightly *and* at least six hours have passed. Version is `<next patch>-nightly.<yyyymmdd>.<run number>`, derived from `package.json` plus one patch.
3. **Stable ships a commit nightly users already ran.** A stable dispatch resolves the commit of the latest published nightly and builds that, with the version the nightly previewed. A `v*.*.*` tag push can also release an explicit commit.
4. **Release re-runs the full quality gate** (check, typecheck, tests, smoke) at the release commit and only publishes if everything is green. Concurrency is queued, never cancelled, and stable has its own group so a nightly never blocks it.
5. **Finalize commits the version bump back to `main`** after a stable release, so the next nightly automatically previews the next patch.
6. **GitHub Release with generated notes** since the previous tag *within the same channel*.
7. **The always-on server component (the relay) is still continuous deploy on `main`** in a separate workflow. Channels apply to what users install, not to their own infra.
8. Consumers pick the channel on their side (`t3 update --channel`, npm dist-tags).

What transfers to PP: channels as image tags, gated nightlies, "stable is a promoted nightly", version bump on release, release notes per channel, instances choosing their channel. What does not: desktop signing, npm, multi-platform matrices.

## Options

### A. Keep continuous deploy, fix the sharp edges

- Fold the image build into `ci.yml` as a job that `needs: check`, so only a green `main` is pushed.
- Replace archived Watchtower with the maintained fork (same image interface, same labels) or a systemd timer running `docker compose pull && docker compose up -d` so `app` and `web` move together.
- Keep `latest` meaning "tip of main".

Effort: half a day. Gives safety but no stability: `pp.igne.nl` still receives every merge.

### B. Two channels with digest promotion (T3 model, tailored) — recommended

Image tags become the channels. Nothing is rebuilt after CI; promotion retags an existing digest with `docker buildx imagetools create`, so the bytes that ran on the homelab are the bytes that reach production. This is stronger and cheaper than T3's rebuild-at-release, which they need for signing.

Workflows:

- **`ci.yml` on push to `main`:** check, test, build, then push `sha-<short>` and `main` tags. Only the gate feeds the push.
- **`nightly` (scheduled, e.g. `8 */6 * * *` plus `workflow_dispatch`):** skip unless `main` is ahead of the last nightly tag and the minimum gap has passed. Retag that commit's `sha-` images as `nightly` and `vX.Y.Z-nightly.<date>.<run>`. Create a GitHub prerelease with generated notes since the previous nightly.
- **`stable` (`workflow_dispatch`, optional `version` input):** resolve the commit of the latest nightly, assert it is on `main`, retag its digest as `vX.Y.Z`, `X.Y`, `stable` and `latest`. Create a GitHub Release with notes since the previous stable. A `finalize` step commits the `package.json` bump to `main`. A `v*.*.*` tag push releases an explicit commit for hotfixes.
- **Preview (optional, later):** PRs with a `preview` label push `pr-<n>` tags so a branch can run on the homelab before merge. This is T3's preview train without the ceremony.

Instances:

- Homelab sets `IMAGE_TAG=nightly`. `pp.igne.nl` sets `IMAGE_TAG=stable`. Any dev box can track `main`.
- Replace Watchtower with a systemd timer (`docker compose pull && docker compose up -d`, every 15 minutes) or What's Up Docker if a dashboard and manual approval are wanted. The timer has no third-party dependency, recreates `app`, `migrations` and `web` in one pass, and respects `depends_on`. The Watchtower fork is the zero-change fallback.
- `latest` changes meaning from "tip of main" to "stable". That is the Docker convention and the behaviour production wants; the homelab must set `nightly` explicitly before the switch.

App changes:

- `APP_VERSION` carries the channel version (`0.3.0`, `0.3.1-nightly.20261028.412`) plus the short SHA. Expose it on `/api/health` and in the frontend (settings footer or about dialog) so a glance tells you what is running where.
- Migration policy: expand/contract across one stable release so `IMAGE_TAG=<previous>` is always a safe rollback. Nightly running ahead on the homelab means every migration is exercised before stable sees it, which is T3's "server self-update invariant" for free.

Effort: two to three days including docs. Day one is option A. Day two adds the nightly and stable workflows and the version display. Day three switches instances and updates `docs/deploy.md`.

### C. Release PR automation (release-please or changesets)

A bot opens a "release X.Y.Z" PR from Conventional Commits (release-please) or from per-PR changeset files (changesets); merging it tags and triggers the stable build. `main` stays continuous for the homelab.

Pros: changelog and version bump for free, decision is a PR merge. Cons: PP commits are `T-120: …` style, not Conventional Commits, so release-please would produce empty notes unless the team changes habits. Changesets adds a file per PR for a two-person team. The original `google-github-actions/release-please-action` was archived in 2024; the maintained one lives under `googleapis`. Option B's `finalize` bump plus GitHub generated notes delivers most of this with no new commit discipline.

### D. Push-based deploy through GitHub Environments

CI deploys explicitly to `staging` (homelab) and `production` (DO) environments, with a required reviewer on production, by reaching the hosts over Tailscale or a Komodo webhook. Gives a "deploy to production" button, audit log and environment secrets in GitHub.

Pros: one place to see what is where. Cons: breaks the current "no SSH from CI to the homelab, no public ports" rule, needs Tailscale in CI or a Komodo server plus periphery agents. Worth it if the fleet grows past a handful of instances. It composes with B later: B defines *what* a release is, D only changes *how* instances learn about it.

## Recommendation

Option B. It matches what you liked about T3 Code (gated nightly, stable is a promoted nightly, version bump on release, per-channel notes) while being simpler in the ways that matter for a self-hosted image: promotion is a retag of a tested digest, the instance picks its channel through one env var, and no commit conventions change.

Decisions needed before building:

1. Nightly gap: six hours like T3, or once a day at a fixed hour.
2. Puller on the instances: systemd timer, Watchtower fork, or What's Up Docker.
3. Whether `latest` should alias `stable` (recommended) or be retired.
4. Starting version for the first stable (`0.1.0`).

## Sources

- T3 Code release workflow and scripts: `pingdotgg/t3code` `.github/workflows/release.yml`, `.github/scripts/check-nightly-release.cjs`, `scripts/resolve-nightly-release.ts`, `docs/operations/release.md`.
- Watchtower archived status: `containrrr/watchtower` (archived, last push 2025-12-17). Maintained alternatives checked 2026-10-28: `nicholas-fedor/watchtower`, `getwud/wud`, `crazy-max/diun`, `moghtech/komodo`.
- Release tooling comparison: https://www.tenki.cloud/blog/release-automation-github-actions and https://xnok.github.io/infra-bootstrap-tools/blog/intentional-releases-changesets/
- Community experience leaving Watchtower for pinned tags: https://discuss.mschae23.de/post/15567 and https://redlib.ssps.io/r/selfhosted/comments/1je2o4u/psa_watchtower_is_an_unmaintained_project
