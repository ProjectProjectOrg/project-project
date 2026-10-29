# pp

ProjectProject from your terminal. `pp` runs the same tools agents use over MCP, with its own sign-in, so it keeps working when an agent host's MCP connection doesn't.

## Install

Open Terminal and paste the line for your ProjectProject server, replacing `pp.example.com` with its address:

```sh
curl -fsSL https://pp.example.com/api/cli/install.sh | sh
```

This installs the `pp` that matches your server and then signs you in: your browser opens, you approve, and you're done. Nothing else needs to be installed first. `pp` goes into `~/.local/bin`, and the installer adds that folder to your terminal's PATH, so open a new Terminal window afterwards.

To install the latest release without signing in to a server yet:

```sh
curl -fsSL https://github.com/ProjectProjectOrg/project-project/releases/latest/download/install.sh | sh
```

`pp` runs on macOS (Apple silicon and Intel) and Linux.

### Upgrade

```sh
pp upgrade              # the version that matches your server
pp upgrade --latest     # the latest stable release
pp upgrade --nightly    # the latest nightly
```

If `pp` and your server drift apart, commands stop and tell you to run `pp upgrade`.

### From the repository

```sh
bun run --cwd apps/cli pp -- <command>   # run from source
bun run --cwd apps/cli build             # writes apps/cli/dist/pp
```

## Sign in

```sh
pp login pp.example.com
```

`pp` reads the server's discovery documents, opens your browser to sign in, and saves the server. If the browser doesn't open, it prints the link to visit. Sign in to more than one server and pick one with `--server`, `PP_SERVER`, or `pp servers use <address>`.

```sh
pp servers list
pp logout            # revokes the sign-in and forgets the server
```

Saved servers and their tokens live in `~/.config/pp/servers.json` (or `$XDG_CONFIG_HOME/pp`), readable only by you.

## Commands

Every tool has a command, generated from the same catalog as the MCP server:

```sh
pp orgs list
pp projects list --org acme
pp tickets list --org acme --project website --status todo --assignee mine
pp tickets get T-80
pp tickets update T-80 --status in_progress
pp tickets comment T-80 --body @notes.md
pp tickets attach T-130 ./screenshot.png
pp tools                                  # every tool and its command
```

- Flags that take several values are repeated: `--status todo --status in_progress`.
- Text flags accept `@file`, or `@-` for standard input.
- JSON flags take JSON or `@file`.
- Add `--json` to any command for machine-readable output.

Any tool can also be called with raw JSON:

```sh
pp call get_ticket '{"id":"T-80"}'
pp call update_ticket @changes.json
echo '{"id":"T-80"}' | pp call get_ticket -
```

Commands that work inside an org or project take `--org` and `--project`; find the slugs with `pp orgs list` and `pp projects list`. With `pp call`, `--org` and `--project` fill in `orgSlug` and `projectSlug` when the input leaves them out.

`pp` never prompts unless you ask for it with `--wizard`, so agents can run it without hanging. Shell completions: `pp --completions zsh` (also `bash` and `fish`).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unexpected error |
| 2 | Wrong usage: a missing org or project, or bad input to `pp` itself |
| 3 | Not signed in, or the sign-in expired or was revoked: run `pp login` |
| 4 | Forbidden: your role doesn't allow this |
| 5 | Not found |
| 6 | The server rejected the input |
| 7 | Conflict with the current state |
| 8 | The server can't be reached, or isn't a ProjectProject server |
| 9 | An external service (GitHub, storage) failed |
| 10 | `pp` doesn't match the server's version: run `pp upgrade` |
