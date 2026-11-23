# Changesets

Every pull request adds at least one file here. Release notes are built from them: the GitHub release, the sidebar's "What's new" card and the changelog page. Stable releases use the changesets added since the previous stable; nightlies use the ones added since the previous nightly. Your line is read by people upgrading to a stable release, so write it for them even when the change ships in a nightly first.

```md
---
kind: features
area: sprints
highlight: true
video: drag-between-sprints
where: Sprint board; drag a ticket onto another sprint's header
---
Drag tickets between sprints

Pick a ticket up on the sprint board and drop it on another sprint's
header. Its place in the backlog comes along.
```

Most changesets are only `kind`, `area` and the line.

## Fields

- `kind` (required):
  - `features`: something new people can do.
  - `improvements`: something that got better or faster.
  - `fixes`: a bug that is gone.
  - `internal`: nothing a user can see (refactors, tests, CI, tooling), or work nobody can use yet. Left out of the release notes. Takes no `area`, body or highlight.
- `area` (required unless `internal`): where the change lives, one of the areas below. The changelog groups lines by area and labels each group.
- `highlight` (optional): `true`, or a rank `1`, `2` or `3` (1 leads). A headline change: it gets a title, its video, a body and a "Where" line at the top of the release, and leads the sidebar card. Needs `video` and a body. A stable release has one to three, ranked by whoever cuts it ("Before a stable release").
- `video` (highlights only, required there): a kebab-case name for a pair of files in `.changeset/media/`: `<name>.light.mp4` and `<name>.dark.mp4`, each at most 3 MB. The app plays the one that matches the person's theme.
- `where` (highlights only, optional): one short line on how to find it, place first: "Settings → Ticket types", "Any ticket list; tick the box at the start of a row".
- `notice: true` (optional): something to know before updating: a breaking change, a migration, a security fix to act on. Shown under "Before you update". Needs a body that says what to do. Its `kind` is the kind of the change it warns about. Never also a highlight. A breaking change that also adds something is two files: the line, and a notice with the same `pr`.
- `pr` (optional): the pull request this line belongs to, when it isn't the one that adds the file, such as `pr: 498`.
- `prs` (optional): other pull requests this line covers, such as `prs: 466, 471`. The line links to them too.
- `follows` (`internal` only): the pull request whose unreleased line this one finishes or fixes, such as `follows: 466`. That line then links to yours too.

Any other field fails the check, so a typo like `layuot` doesn't slip through. `layout` and `value` are gone: a highlight and a notice each have one fixed look, and every other change is a line.

## Areas

In the order the changelog lists them:

- `tickets`: a single ticket: its fields, menu, page, activity, relations, archiving.
- `lists`: the backlog and other ticket lists and boards: rows, cards, order, filters, selection.
- `sprints`: sprint planning, dates, capacity and the sprint overview.
- `comments`: comments, replies, threads and mentions.
- `editor`: writing descriptions: formatting, links, editing and reading.
- `projects`: project setup, settings, import and export.
- `people`: members, invites, sign-in and avatars.
- `integrations`: GitHub, Jira, Figma, Everhour, Slack and other connected products.
- `agents`: agents, the MCP server and the `pp` command line.
- `navigation`: the sidebar, the command menu, search, shortcuts and moving around.
- `appearance`: the look: theme, colors, type, motion.
- `self-hosting`: running your own instance: deploys, upgrades, server settings and security.

When two fit, pick where people will look for it.

## The line and the body

The first line is the summary. It is the highlight's title, or the line in the lists.

- Say what the person can do ("Drag tickets between sprints") or what no longer goes wrong ("Sprint dates land on the right day"). Don't start with "You can now".
- One line says one thing. Two changes are two files, even in one pull request (the second one sets `pr`). A pull request of several small fixes in one area may use one line that names the area ("Command menu: failed searches stop spinning, and two more fixes").
- 20 words at most, no period at the end.
- Use the names people see in the app. Products people connect may be named (GitHub, Jira, Slack, MCP); files, components and libraries may not, with three exceptions: an `agents` line may name MCP tools and `pp` commands (`list_types`, `pp types list`); a notice body may name environment variables and settings (`BETTER_AUTH_SECRET`); a `self-hosting` line may name the software and libraries an operator would recognize from an advisory (nginx, Postgres, Better Auth).
- The area label already says "Self-hosting", so don't start the line with it.
- Name a control before its shortcut: "the command menu", not "⌘K". If the key matters, write both, Mac first: "⌘K (Ctrl+K)".
- Spell as the app does: American English ("color").
- A security fix says what was at risk in plain words. If self-hosters must act, make it a notice and put the action in the body.
- An `internal` changeset says what changed for developers instead.

A highlight or notice adds Markdown below the first line: a sentence or two on what changed and why it helps, or for a notice, what to do. Plain lines have no body.

Name the file after the change, such as `description-jump.md`; if the name is taken, add a word.

## Follow-ups, replacements, polish and groundwork

A release describes what ships, not each pull request. Before you write a line, look at the changesets no stable has shipped yet (`bun run changelog:check` lists how many; `git diff --name-only --diff-filter=A <last stable tag> -- .changeset` names them).

- **Follow-up**: your pull request finishes or fixes one of them. A fix for a bug no stable shipped is a follow-up of the pull request that introduced it, even if that line is about something else; the bug shipped only if `git merge-base --is-ancestor <commit that introduced it> <last stable tag>` succeeds. The earlier line stays the line: add `kind: internal` with `follows: <its pull request>`, and edit the earlier line in the same pull request if it no longer says what ships. If you also fix a bug that already shipped, that fix is its own `fixes` file.
- **Replacement**: your pull request replaces one of them (the earlier change is gone, or looks different now). Your line is the line: delete the earlier changeset and name its pull request in `prs`.
- **Polish**: a change nobody would notice by itself (a 2px gap, a spinner that now spins). Add it to the `prs` of the unreleased line it polishes, whatever that line's area, and make your file `kind: internal`; if no line covers it, `kind: internal` alone.
- **Groundwork**: your pull request does nothing a user can see or use yet (storage, or a control whose result only shows on a page not built yet). Use `kind: internal`. The pull request that makes it usable writes the line and names yours in `prs`.

Name only pull requests merged into main. Pull requests merged into a stack branch are covered by the pull request that merged the stack.

Edit or delete a changeset only while no stable has shipped it. A shipped changeset is history, and so is its video: past releases still play it.

## Videos

Every highlight has a video: what the feature does and where it lives, in 4 to 8 seconds, 1280×720, no sound. Make it twice with the same steps: once in the light theme and once in the dark theme.

Use Remotion for one control or interaction. Record the app when the video has to show where something lives (navigation, a page layout, a redesign). If both fit, the tiebreak: a change inside a page people already know is recorded; a single control is Remotion.

The middle of the clip must show the feature at rest; that frame is the still people with reduced motion see.

- **Remotion** (reproducible): add a composition in `apps/videos/src/compositions/`, register it in `apps/videos/src/Root.tsx` under the video's name, then run `bun run --filter @pp/videos render <name>`. It renders the real `@pp/ui` components in both themes and writes `.changeset/media/<name>.light.mp4` and `<name>.dark.mp4`. It refuses to overwrite existing files, since a shipped video is history; pick a new name, or pass `--force` for a video no stable has shipped. Preview with `bun run --filter @pp/videos studio` (the `theme` prop switches between them).
- **Screen recording**:
  1. Set the browser viewport to 1280×720. Dismiss one-time UI first: the "What's new" card, first-run guides, toasts.
  2. Open every page once so nothing loads on camera, then record the same steps in each theme. Drive them with a browser script so both takes match.
  3. Convert each take, keeping only the seconds that show the change (`START` and `END` in seconds):
     `ffmpeg -i light.mp4 -vf "fps=30,trim=START:END,setpts=PTS-STARTPTS,crop='min(iw,ih*16/9)':'min(ih,iw*9/16)':0:0,scale=1280:720" -an -c:v libx264 -crf 28 -pix_fmt yuv420p -movflags +faststart .changeset/media/<name>.light.mp4`
     `fps=30` comes first because browser recordings have an uneven frame rate and cut in the wrong place without it. The crop makes any recording 16:9 from its top left corner, so a HiDPI take still comes out at 1280×720.
  4. Look at the first, middle and last frame of both files before you commit. A loading screen or a leftover card means recording again.

## Before a stable release

A stable release can't ship without good notes: the stable workflow runs the release check before it promotes anything and stops on an error. The check:

- every changeset since the previous stable is valid,
- one to three highlights, each with a distinct rank when there are several, a body and both video files under 3 MB (a hotfix may have none),
- every notice has a body,
- no two lines say the same thing,
- every `follows` points at a pull request with a line in this release.

Every nightly keeps a draft GitHub release, "Next stable (draft)", with the notes the next stable would publish and the check's problems, so you can see where it stands at any time.

Whoever cuts the release reads the unreleased changesets as one set and opens a pull request that edits them:

1. Run `bun run changelog:check` for the problems, and `bun run changelog:preview` to see the release on `/changelog` in the dev app. It writes the local `changelog.json` and `changelog-media/`, as the release will.
2. Pick one to three highlights and rank them `highlight: 1`, `2`, `3`. Make the other highlights plain lines: remove `highlight`, `video`, `where` and the body.
3. Fold lines that describe the same change into one, name the other pull requests in `prs`, and delete the other files. Fold only lines about the same change, not lines that sit near each other.
4. Delete lines for things replaced before anyone saw them, and make polish `internal` as above.

That pull request adds its own `kind: internal` changeset, like any other.

Writing a whole release's set at once (after the fact, or a folder for a dry run) works the same way: one file per change, `pr` on each file, since no pull request adds them. A follow-up, polish or groundwork pull request gets no file of its own: name it in the `prs` of the line it belongs to (`follows` is only for a pull request that adds its own file). Each internal pull request gets one `kind: internal` file with `pr`, so every pull request merged into main appears in some file. Both commands take `--dir <folder>` to read a folder instead of the working tree; a `pr-map.json` there (`{ "file.md": 498 }`) stands in for `pr`.

## CI

CI checks every pull request: at least one new changeset, and valid fields, a line of 20 words at most and a video in both themes under 3 MB in every changeset it adds or edits. The job summary shows how each line will appear: its heading, area and text.
