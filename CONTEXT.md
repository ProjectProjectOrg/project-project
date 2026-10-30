# ProjectProject

The domain language. Use these words in code, UI copy, commits and tickets, and avoid the listed alternatives. When a term here is wrong or missing, fix it in the same PR.

## Language

### Organizations and people

**Organization** (org):
The tenant. Owns people, projects, integrations, storage and the org-level library. Every URL and markdown path starts with the org slug.
_Avoid_: Workspace, team, tenant (in UI)

**Org role**:
`owner`, `admin`, `member` or `guest`. Governs the org: its people, integrations and projects.

**Project role**:
`pm`, `developer` or `client`. One per person per project. A project always keeps at least one PM.
_Avoid_: Project admin, project owner

**Member**:
A user with accepted access to a project.
_Avoid_: Pending member, invitee

**Pending project member**:
An email address with a pending invitation that will grant project access if accepted.
_Avoid_: Member, user

### Projects and tickets

**Project**:
A set of tickets, sprints and settings inside an org. Identified by its slug in URLs and by its **project key** in ticket ids.

**Project key**:
The uppercase prefix of a project's ticket ids (`PP` in `PP-12`). Older projects use `T`.
_Avoid_: Prefix, code

**Ticket**:
A unit of work, stored as one markdown file. Has a type (`feat`, `bug`, `chore`, `other`, `epic`), a status, a priority (`low`, `med`, `high`), tags, assignees and an optional estimate.
_Avoid_: Issue, task, card (except for the board's visual card)

**Epic**:
A ticket of type `epic`. It can hold sub-tickets of any type.

**Sub-ticket**:
A ticket with a parent. An epic, a ticket with no parent, or a child of an epic can be a parent, so nesting stops two levels below an epic.
_Avoid_: Child issue, subtask

**Status**:
A project-defined column a ticket moves through. Projects start with `todo`, `in_progress` and `done` and can add their own.

**Status phase**:
`unstarted`, `started` or `finished`, derived from where a status sits relative to `in_progress` and `done`. Logic that asks "is this ticket done?" asks the phase, never a status slug.

**Tag**:
A project-scoped label with a colour from the tag wheel.
_Avoid_: Label

**Estimate**:
A ticket's size in the project's **estimation mode**: `points`, `tshirt`, `time`, or `off`. An estimate in a unit the project no longer uses is **stale**.

### Planning

**Group**:
The storage concept behind sprints: a markdown file under `groups/` with a kind. In practice every group is a **sprint**.
_Avoid_: Using "group" in UI copy

**Sprint**:
A group of tickets with optional start and end dates, planned by the PM and completed when it ends.

**Backlog**:
The tickets in no sprint.

### Git

**Linked branch**:
A branch recorded on a ticket, with its base, PR number, PR state and whether it has **landed** (merged into the default branch).

**Stack** / **stack layer**:
A chain of branches where each one's base is the branch before it. Each branch in the chain is a layer; a ticket's own branch is the bottom layer.

**Ignored branch**:
A branch a person removed from a ticket. It is never linked automatically again.

**Git automation**:
Project rules that move a ticket to a status on a git event: branch linked, PR opened (draft or ready), merged or closed, branch deleted.

### Library

**Library**:
The reusable blocks and templates of an org or a project. A project item can shadow or hide an org item with the same key.

**Block**:
A named, reusable piece of markdown inserted into a ticket body as `<block type="…">…</block>`.

**Template**:
A starting body, priority and tags for a new ticket. A project can set a default template per ticket type.

### Surfaces and delivery

**Tool catalog**:
The one set of typed tools in `packages/shared/src/tools`, served over MCP and to the CLI.

**pp**:
The CLI. Always lowercase in prose and code.
_Avoid_: PP CLI (except on the OAuth consent screen)

**Release channel**:
`nightly` or `stable`. Nightly builds `main`; stable promotes a soaked nightly.

## Relationships

- An **Organization** has many **Projects**; a person reaches a project only through the org.
- A **Member** has exactly one **project role** on a project.
- A **Pending project member** belongs to exactly one pending organization invitation and one project.
- A **Pending project member** becomes a **Member** only when the invitation is accepted.
- A project detail includes both **Members** and **Pending project members** for the members list.
- **Pending project members** are transient database-backed invite state, not markdown frontmatter.
- Re-inviting the same **Pending project member** updates the existing pending project role instead of creating a duplicate invite.
- Only an owner may change a **Pending project member** role.
- Only an owner may invite or promote someone into the admin role; admins may invite members only.
- A **Pending project member** can be canceled from the project members list.
- Resending a **Pending project member** invitation is not part of the current flow.
- Canceling a **Pending project member** removes that project grant; the underlying organization invitation is canceled only when no project grants remain.
- A **Pending project member** is displayed by email, not by a user profile, until the invitation is accepted.
- A **Ticket** is in at most one **Sprint**; otherwise it is in the **Backlog**.
- A **Ticket** has at most one parent: an **Epic**, a ticket without a parent, or a child of an **Epic**.
- A **Ticket** can have several **linked branches**, forming **stacks**.

## Example Dialogue

> **Dev:** "Should the pending invite show in the members list?"
> **Domain expert:** "Yes, visually. But it is a **Pending project member**, not a **Member**, because it does not grant access until the invitation is accepted."

> **Dev:** "Can I check `status === 'done'` to hide finished tickets?"
> **Domain expert:** "No. Projects add their own statuses after `done`. Ask the **status phase**."

## Flagged Ambiguities

- "member" was used to mean both accepted project access and pending invitees. Resolved: **Member** only means accepted access; **Pending project member** means an invite grant waiting for acceptance.
- "epic" is both a ticket type and a `GroupKind` (`sprint`, `epic`, `milestone`, `other`). Resolved: an **Epic** is a ticket; the non-sprint group kinds are unused.
