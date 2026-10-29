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

Once a day `pp` asks your server which release it runs. When yours is different, commands still work and end with a line suggesting `pp upgrade`. If `pp` and your server drift so far apart that their tools differ, commands stop and tell you to run `pp upgrade`. Set `PP_NO_UPDATE_CHECK=1` to turn the daily check off.

### From the repository

```sh
bun run --cwd apps/cli pp -- <command>   # run from source
bun run --cwd apps/cli build             # writes apps/cli/dist/pp
```

## Sign in

```sh
pp login pp.example.com
```

`pp` reads the server's discovery documents, opens your browser to sign in, and saves the server. Once you approve, the browser shows a ProjectProject page saying you're signed in, or why not, and you can go back to your terminal. If the browser doesn't open, `pp` prints the link to visit. Sign in to more than one server and pick one with `--server`, `PP_SERVER`, or `pp servers use <address>`.

```sh
pp servers list
pp logout            # revokes the sign-in and forgets the server
```

Saved servers and their tokens live in `~/.config/pp/servers.json` (or `$XDG_CONFIG_HOME/pp`), readable only by you.

## Your org and project

Most commands work inside an org and a project. You don't have to name them every time: when you sign in, `pp` remembers which ones to use. If you belong to one org with one project, it picks those. If you have several, it asks you to choose, but only when you're at a terminal yourself; agents are never asked.

```sh
pp status                 # the server, account, org and project in use, and why
pp use acme/website       # use acme's website project from now on
pp use                    # choose from a list
pp use --clear            # forget the choice
```

For each command, `pp` takes the first of these that gives an answer:

1. `--org` and `--project`
2. The `PP_ORG` and `PP_PROJECT` environment variables
3. Your choice from `pp use` or sign-in. Its project only counts when the org is the same, so `--org other` doesn't borrow it.
4. Your only org, or the org's only project
5. Otherwise the command stops and lists the orgs or projects to choose from

## For agents

`pp guide` prints how to work with ProjectProject through `pp`: the same guidance agents get over MCP, with `pp` commands instead of tool names. Agents should read it first.

## Commands

Every tool has a command, generated from the same catalog as the MCP server:

```sh
pp tickets list --status todo --assignee mine
pp tickets get T-80
pp tickets update T-80 --status in_progress
pp tickets comment T-80 --body @notes.md
pp tickets attach T-130 ./screenshot.png
pp tools                                  # every tool and its command
```

- Flags that take several values are repeated: `--status todo --status in_progress`.
- Clear a field with `null` (`--parent null`, `--starts-at null`) and a list with an empty value (`--tags ''`, `--assignees ''`).
- Text flags accept `@file`, or `@-` for standard input.
- JSON flags take JSON or `@file`.
- Add `--json` to any command for machine-readable output.

Any tool can also be called with raw JSON:

```sh
pp call get_ticket '{"id":"T-80"}'
pp call update_ticket @changes.json
echo '{"id":"T-80"}' | pp call get_ticket -
```

`pp call` fills in `orgSlug` and `projectSlug` the same way when the input leaves them out.

`pp` only prompts when you run `pp use` or `pp login` at a terminal, or ask for it with `--wizard`, so agents can run it without hanging. Shell completions: `pp --completions zsh` (also `bash` and `fish`).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unexpected error |
| 2 | Wrong usage: `pp` can't tell which org or project to use, or bad input to `pp` itself |
| 3 | Not signed in, or the sign-in expired or was revoked: run `pp login` |
| 4 | Forbidden: your role doesn't allow this |
| 5 | Not found |
| 6 | The server rejected the input |
| 7 | Conflict with the current state |
| 8 | The server can't be reached, or isn't a ProjectProject server |
| 9 | An external service (GitHub, storage) failed |
| 10 | `pp` doesn't match the server's version: run `pp upgrade` |
