const BLOCK_FORMAT_EXAMPLE =
  '<block type="acceptance-criteria">\n\n' +
  "## Acceptance criteria\n\n" +
  "- [ ] Given a starting state, when something happens, then this is true\n\n" +
  "</block>"

export const MCP_INSTRUCTIONS = [
  "ProjectProject is a markdown-first project management tool. An " +
    "organization holds projects; a project holds tickets (ids like " +
    "`T-12`, prefixed by the project's key), groups such as sprints, " +
    "epics and milestones (ids like `G-3`), tags, statuses and members. " +
    "Every project tool takes `orgSlug` and `projectSlug`: find them " +
    "with `me`, `list_orgs` and `list_projects` rather than guessing.",
  "Statuses are defined per project, so call `list_statuses` before " +
    "you read or move tickets. Each status has a `slug` that tools " +
    "take, a `label` to use in conversation, an optional `description` " +
    "of what it means for the team, and `setBy`, the git events that " +
    "move a ticket into it automatically.",
  "Working on a ticket:\n" +
    "1. Read it with `get_ticket`. If its status says it isn't ready to " +
    "start, refine it first (below) or ask.\n" +
    "2. Assign yourself: take your user id from `me` and add it to the " +
    "ticket's `assignees` with `update_ticket`, keeping anyone already " +
    "assigned.\n" +
    "3. Create a branch with your own git tooling, with the ticket id " +
    "in its name (e.g. `feat/T-12-short-description`), push it, and " +
    "link it with `attach_branch`. For stacked pull requests, link each " +
    "layer above it with `stack_branch`, bottom to top.\n" +
    "4. As you complete acceptance criteria, tick them with an " +
    "`update_ticket` `edits` entry that replaces `- [ ] criterion` with " +
    "`- [x] criterion`.\n" +
    "5. Open the pull request with the ticket id in its title.\n" +
    "6. Leave a comment with `create_comment` summarising what changed, " +
    "with a link to the pull request.\n" +
    "Move the status yourself with `update_ticket` only for steps that " +
    "no status's `setBy` covers. Never set a status by hand that " +
    "automation sets, such as the one set by `pr_merged`.",
  "Refining a ticket: read the ticket and the project's `body` " +
    "(`get_project`), then fill in its blocks: the context, acceptance " +
    "criteria someone could check, and what is out of scope. Once the " +
    "criteria are concrete and no open questions remain, move the " +
    "ticket to the next status in `list_statuses` order. If questions " +
    "remain, leave the status as it is and list the questions in the " +
    "ticket.",
  "Writing a ticket: first look for an existing one with " +
    "`list_tickets` and `q`. Start from a template when one fits " +
    "(`list_templates`, then `create_ticket` with `template`). Write " +
    "for someone who wasn't in your conversation: a title that names " +
    "the outcome, one or two plain sentences at the top saying what and " +
    "why, then the details. Spell out project-specific terms, mention " +
    "related tickets instead of assuming the reader knows them, use " +
    "only tags that exist (`list_tags`), and assign no one unless " +
    "asked.",
  "Ticket bodies are CommonMark markdown and can hold named blocks: " +
    "reusable, structured sections such as acceptance criteria or a " +
    'definition of done, written as `<block type="key">`, a blank line, ' +
    "the content, a blank line, then `</block>`, for example:",
  BLOCK_FORMAT_EXAMPLE,
  "Call `list_blocks` and `list_templates` to see what a project " +
    "defines before writing blocks by hand. Fill blocks in rather than " +
    "replacing them: keep the `<block>` tags and headings, and replace " +
    "each trailing `{{hint}}` placeholder with real content or leave " +
    "the line empty. A block with the trailing `sync` attribute " +
    '(`<block type="key" sync>`) is a shared, managed definition such ' +
    "as a definition of done: leave its text alone and only tick or " +
    "untick its checkboxes. Malformed block markup is rejected with a " +
    "`Validation` error naming the line and the fix.",
  "Attachments: call `prepare_ticket_attachment`, POST the file bytes " +
    "to its `uploadUrl` from your file environment, then add the " +
    "returned markdown to the ticket body with an `update_ticket` " +
    "`append` edit."
].join("\n\n")
