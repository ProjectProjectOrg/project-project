# Local agent verification

Run these from the worktree root, after `bun install`:

```sh
bun run dev:agent
```

Keep it running while verifying. Startup prints the HTTPS app address and a fresh magic link. Open that link in the browser used for verification; it signs in as `agent@example.test` and lands in the Verification project. For another link:

```sh
bun run dev:login
```

Each worktree gets a stable Portless hostname, a separate database and non-superuser owner, independent authentication/encryption secrets, and markdown under `.agent.local/projects`. The synthetic user is an organization owner and project PM. The fixture contains an epic, tickets in different statuses, an assignment, a tag, a blocking relation and a sprint. It intentionally has no attachments or external integration connections. Normal sessions and access checks apply.

Node 24+, Bun and Docker are required. The first start can pull `postgres:16-alpine`. Portless 0.18.0 runs a separate loopback HTTPS proxy on port 1355, with state under `<git-common-dir>/pp-agent/portless`. It does not reuse or stop the normal development proxy. The first start creates a local certificate authority; depending on the OS, trusting it may require a one-time system prompt. If the browser reports an untrusted certificate, run:

```sh
bun run dev:agent:trust
```

Use the printed hostname, including `:1355`, rather than the underlying Vite port. API, authentication, MCP and discovery requests go through that origin to this worktree's backend. `dev:login` must run in the same worktree as the servers. Magic links are credentials: do not commit them, paste them into PRs, or store them in the registry.

## Isolation and persistence

All agent environments share the dedicated `projectproject-agent-postgres` container and `projectproject-agent-postgres-data` volume. The server publishes PostgreSQL only on an automatically allocated loopback port. It is separate from the existing development Compose project. Setup and cleanup never stop that project or remove its volumes.

New environment names use the branch name, normalized to lowercase ASCII and truncated to 40 characters, plus an eight-character random suffix. For example, `feat/readable-names` becomes `feat-readable-names-a1b2c3d4`: the hostname is `pp-feat-readable-names-a1b2c3d4.projectproject.localhost`, the database and role are `pp_agent_feat_readable_names_a1b2c3d4`, and the registry resource directory uses the same environment name. The suffix separates worktrees and clones with the same branch label. Names are fixed when the environment is created, so renaming a branch preserves its data and address. Existing environments with hexadecimal IDs retain their names and remain supported. Older helper versions cannot read the new names; update or rebase those worktrees before using their agent commands once named environments exist. Runtime processes receive generated configuration, not the worktree's `.env` or inherited integration credentials. Feedback delivery is disabled. The application role owns its database but has no superuser, role-creation or database-creation privileges. Database ACLs deny other worktree roles access. This prevents accidental application cross-access; it is not a sandbox for an agent with Docker or filesystem access.

Restarting preserves edits and does not reseed. Ctrl-C stops the servers. From another terminal, this also preserves data:

```sh
bun run dev:agent:stop
```

Startup marks the environment incomplete before applying migrations, then records the successfully applied history before starting its single backend/workflow runner. A migration failure or interruption leaves startup blocked for explicit recovery; a later server startup failure retains the new history. Applied migration names and hashes must remain an unchanged prefix of the checkout's history. Divergent or older history, changed fixture versions, and incomplete initial setup block startup. Rebuild explicitly; there is no automatic destructive reset. Bump `fixtureVersion` in `apps/backend/scripts/agent/fixture.ts` when changes require rebuilding the paired fixture or markdown format.

## Cleanup

To stop and delete only the current worktree's environment:

```sh
bun run dev:agent:clean
```

This requests a graceful server shutdown, verifies database/role/storage ownership, then removes the database, role, `.agent.local` directory and generated secrets. It removes the registry entry last. Active unknown connections, redirected storage paths, changed server identity and uncertain ownership cause cleanup to stop and preserve resources. It never force-drops a database or kills an arbitrary PID.

After worktrees have been removed, list orphaned environments:

```sh
bun run dev:agent:prune
```

Review the list, then explicitly authorize deletion:

```sh
bun run dev:agent:prune --yes
```

Only entries whose paths are absent and are no longer registered with Git qualify. Registered, locked or moved worktrees are not automatically discarded; repair their mapping before cleanup. A missing or corrupt registry never authorizes deleting databases by name prefix. The shared agent server, proxy and volume persist after individual environments are removed, so stopping or cleaning one worktree does not interrupt another.

## T3 Code settle hook

The local ProjectProject project in T3 Code has an **Agent environment cleanup** project script with **Run on settle** enabled. Its command is:

```sh
if [ -f .git ] && [ -f apps/backend/scripts/dev-agent.ts ]; then
  bun run dev:agent:clean
fi
```

The workflow is **implement → start and verify → open and link the PR in T3 → merge → automatic thread settlement and cleanup**. T3 settles a thread when its linked PR merges; manually settling the thread also runs the hook. Settling stops the worktree's agent servers and deletes its fixture database, role, markdown and generated secrets. It leaves source changes, the Git worktree, shared agent Postgres and the shared proxy in place. Saved fixture edits are discarded when the thread is settled. A merge is covered when the PR is linked to the thread in T3. An unlinked GitHub PR cannot trigger this settle hook.

The hook skips the primary checkout and older worktrees without the helper. Cleanup succeeds harmlessly when the current worktree has no registered environment, including when cleanup already ran. Ownership or shutdown failures still fail and preserve resources; inspect the script output and follow the recovery steps below before retrying.

T3 project scripts are local application settings, not Git configuration. Other machines or T3 projects need the same project script configured with **Run on settle** enabled, **Run on worktree create** disabled, and **Stop on settle** disabled. Do not settle a thread whose verification data you want to retain.

## Registry and interrupted operations

Find the registry directory with:

```sh
git rev-parse --path-format=absolute --git-common-dir
```

Append `/pp-agent`. `registry.json` contains IDs, canonical worktree paths, lifecycle states, server identity, fixture versions and migration fingerprints. Per-environment subdirectories hold private `secrets.json` and a temporary `running.json`. No credentials are stored in the registry itself. Worktree storage has an `owner.json` marker. Keep this metadata local.

A shared `registry.lock` serializes setup, migration and cleanup until an environment is ready; running backends do not hold it. Atomic replacement protects registry writes. After a caught failure, the lock is released. Abrupt termination can leave a lock or server marker. Commands wait up to 60 seconds for the lock and then refuse to guess whether it is stale.

For recovery, inspect the recorded host, PID and process start/command identity. Stop any remaining servers belonging to that environment. Remove a stale lock or `running.json` only after establishing that its owner and children have exited, then retry explicit cleanup. Never remove another host's lock or infer ownership solely from a PID, an age or a database prefix. An interrupted provision with missing ownership markers requires manual inspection; cleanup intentionally refuses to adopt it. This first version favors preserving data over automatic stale-process recovery.

Run the focused lifecycle tests with `bun run test:agent`. The migration regressions use temporary databases on the dedicated agent-only Postgres server, starting it if needed; they remove their own databases and files afterward. The tests are also included in `test:all`.
