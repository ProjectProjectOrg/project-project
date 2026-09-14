# Jira Cloud project migration design

Date: 2026-09-14
Status: Approved design, pending ticket publication

## Summary

ProjectProject will offer a one-way, point-in-time migration that creates a new ProjectProject project from a Jira Cloud project. The product language is **Jira migration**, not import, sync, or integration.

The migration prioritizes broad preservation and explicit reporting over pretending that every Jira concept has a native ProjectProject equivalent. Data that maps cleanly becomes normal ProjectProject content. Data that cannot be represented remains in a versioned project-level migration archive and a readable migration report.

The first release targets Jira Cloud sites hosted by Atlassian, typically under `*.atlassian.net`. Jira Data Center, CSV imports, site-backup imports, and ongoing synchronization are outside this release.

Detailed feasibility findings and official Atlassian sources are in [the research note](../../jira-cloud-migration-research.md).

## Goals

- Migrate every supported item visible to the Jira account authorizing the migration.
- Preserve compatible Jira issue keys as ProjectProject ticket IDs.
- Make mappings, omissions, transformations, and permission limitations visible before committing.
- Keep unsupported source data available without adding generated noise to ticket descriptions.
- Allow explicit user-account linking without requiring every Jira identity to match a ProjectProject account.
- Avoid exposing a partially created destination project.
- Make long-running migrations safe to resume after rate limits or transient failures.
- Design and approve the complete high-fidelity wizard in Paper before implementation.

## Non-goals

- Ongoing or bidirectional synchronization with Jira.
- Jira Data Center or Server support.
- CSV or Jira site-backup ingestion.
- Recreating Jira workflows, permissions, automation, screens, boards, dashboards, or third-party app behavior.
- Adding arbitrary custom fields, ticket hierarchy, issue links, watchers, votes, or historical worklogs as new native ProjectProject concepts.
- Expanding ProjectProject's current attachment MIME-type or size limits.
- Adding status categories or changing ProjectProject's terminal-status behavior.

## Product entry and flow

The migration is a full-page wizard launched from the organization's project-creation surface. It uses normal ProjectProject chrome and does not present as a modal or imitate Jira's visual language.

The ordered flow is:

1. **Connect Jira** — explain the one-time migration and authorize Jira Cloud through OAuth 2.0 3LO.
2. **Choose source** — select an accessible Jira site and project.
3. **Scan project** — extract the visible source data and build a normalized, versioned manifest. No ProjectProject project exists yet.
4. **Link accounts** — explicitly map Jira identities to ProjectProject users or choose not to link them.
5. **Map project data** — reconcile statuses, issue types, priorities, labels, components, versions, and destination project identity.
6. **Review migration** — show native content, archived content, restrictions, skipped attachments, normalization collisions, source-permission caveats, and the fixed scan timestamp.
7. **Migrate** — confirm and run a resumable background migration with itemized progress.
8. **Finish** — open the project or inspect the migration report.

Wizard state is stored server-side so the user can leave and resume. Nothing is written to the final destination until the review is confirmed and the migration succeeds.

## Jira extraction

The primary extraction path is Jira Cloud REST API v3, supplemented by the Jira Software Agile API for boards and sprints. Authentication uses OAuth 2.0 authorization code flow (3LO); API-token basic authentication is not a supported product path.

Extraction includes, when visible and available:

- Jira site and project metadata
- Issue and field metadata
- Issues and system/custom field values
- Comments, attachments, worklogs, and changelogs
- Users, roles, watchers, and votes
- Statuses, issue types, priorities, labels, components, and versions
- Parents, subtasks, epics, and issue links
- Jira Software boards, sprints, backlog membership, and rank information
- Restriction and security metadata exposed to the authorizing account

Collection endpoints are paged according to Jira's response tokens rather than assumed page sizes. The job honors `429` responses and `Retry-After`, uses bounded backoff, and checkpoints completed extraction units.

All completeness claims are qualified as data **visible to the connected Jira account**. A successful API response does not establish that the source project contained no hidden issues, restricted comments, private worklogs, or identities hidden by Jira privacy controls.

## Storage and lifecycle

Jira OAuth credentials are encrypted in Postgres as a personal integration, following the established Figma and Everhour integration boundary.

A small Postgres migration record owns:

- initiating ProjectProject user and organization
- source Jira cloud and project identifiers
- migration version and state
- scan timestamp
- progress checkpoints and resumability metadata
- destination identity chosen during mapping
- terminal outcome and report location

Extracted Jira data is normalized into a versioned migration manifest staged under the organization's markdown storage. On success, the manifest and human-readable report move into the destination project under:

`imports/jira/<migration-id>/`

Normal project, ticket, comment, attachment, status, tag, and group data remains canonical in the existing ProjectProject stores. The archive preserves source records and transformations; it does not become runtime application state.

Failed or cancelled migrations never expose a half-created project. Staging data can be retried or explicitly discarded. A successful destination is assembled in staging and published atomically after all required records succeed. Items the user explicitly accepted as skippable during review do not prevent publication.

The scan is a fixed snapshot. Jira changes after its timestamp are not included unless the user rescans before migration.

## Destination project identity and issue keys

The wizard proposes the Jira project name and key for the new ProjectProject project. Compatible Jira issue keys, such as `ABC-123`, become the actual ProjectProject ticket IDs.

Preflight blocks confirmation until the user resolves:

- Jira project keys incompatible with ProjectProject's key constraints
- project slug or key collisions
- ticket-ID collisions
- normalization collisions that would otherwise merge distinct source values

Issue-number gaps are preserved. Keys are not renumbered for cosmetic continuity. When a key must be changed, the original Jira key and ID remain in the manifest and report, and reference rewriting uses the final mapped ID.

## Identity linking and historical attribution

Account linking is always an explicit wizard step, even when Jira exposes email addresses.

For each distinct Jira identity, the wizard shows:

- Jira display name and account state
- Jira email when the API exposes it
- a suggested ProjectProject match when an email match exists
- an explicit ProjectProject user selection
- a **Don't link** choice

Suggested matches are never silently accepted. Former employees, inactive accounts, service accounts, deleted users, and unrelated accounts can remain unlinked. The migration never creates placeholder ProjectProject accounts.

Linked identities are used for native assignees and mention rewriting. Unlinked assignees are retained only in the archive and report.

The comment model receives one narrow migration-specific extension: an imported comment may have a read-only Jira author snapshot instead of a ProjectProject user. The snapshot retains the Jira display name and account ID. The frontend renders it with an **Imported from Jira** marker and does not offer native edit/delete controls. When a Jira identity is linked, the migrated comment uses the linked ProjectProject user normally.

Before implementation, a feasibility spike must validate the identity APIs against a real Jira Cloud project, including email privacy, inactive/deleted users, service accounts, comments, mentions, and pagination.

## Status mapping

The wizard lists every Jira status in use and allows the user to:

- map it to an existing ProjectProject status
- create a ProjectProject custom status
- map multiple Jira statuses to one destination status

Jira statuses in the Done category default to ProjectProject's existing `done` status. ProjectProject's status model does not gain a category field. A newly created custom status remains non-terminal under the current application behavior, even if its Jira source status was in the Done category. The wizard must make this consequence clear before confirmation.

Exact Jira status IDs, names, categories, issue-type associations, and workflow data remain in the archive. Jira workflow transitions and behavior are not recreated.

## Issue type and priority mapping

Every Jira issue type maps explicitly to one of ProjectProject's existing types:

- Feature
- Bug
- Chore
- Other

Every Jira priority maps explicitly to:

- Low
- Medium
- High

Many Jira source values can map to one ProjectProject value. The wizard provides sensible defaults, displays affected issue counts, and requires mappings to be valid before confirmation. Original values remain in the archive.

## Tags and planning groups

- Jira labels become ProjectProject tags after validation and normalization.
- Jira components become tags prefixed with `component:` to avoid collisions with labels.
- Jira epics become epic groups.
- Jira versions/releases become milestone groups.
- Jira sprints become sprint groups, including completed sprint history.

Names, descriptions, dates, completion state, and ticket membership are preserved when the destination model supports them. Jira rank and exact cross-board ordering may be approximate and are reported when they cannot be reproduced.

Epic and milestone structures exist in the backend but are not yet usable in the frontend. Jira migration must not ship until the resulting epic and milestone groups are accessible in the ProjectProject frontend. This is a release dependency recorded on the migration ticket, not a separate ticket created as part of this work.

## Relationships and links

Jira subtasks are imported as ordinary ProjectProject tickets. ProjectProject does not gain a general parent-child or issue-link model.

Parent/subtask relationships, custom hierarchy, and typed inward/outward issue links remain in the archive and report. Epic membership is represented natively through epic groups.

Jira issue links found in migrated descriptions and comments are rewritten after ticket IDs are finalized:

- links to issues migrated into the destination project point to their ProjectProject tickets
- links to issues outside the selected project continue to point to Jira

This requires two-pass processing so all source-to-destination ticket IDs are known before content links are finalized.

## Native migration fidelity

The migration creates native ProjectProject data for:

- project name, key, description, and Jira source link
- every source issue visible to the connected Jira account
- compatible issue keys and historical created/updated timestamps
- titles and descriptions converted from Atlassian Document Format to Markdown
- comments with historical timestamps and correct linked or imported attribution
- supported attachments
- current linked assignees
- mapped statuses, types, and priorities
- normalized labels and component tags
- epics, milestones, and sprints

ADF conversion preserves readable headings, lists, tables, links, code, and text. Unsupported constructs degrade to a readable representation, are counted in the report, and retain their original ADF in the archive.

Mentions become ProjectProject mentions when the Jira identity is linked. Unlinked mentions become plain display names. Attachment and ticket references are rewritten only when a durable ProjectProject destination exists.

## Migration archive and report

The project-level archive retains:

- source site/project identifiers and scan metadata
- original Jira JSON and ADF
- field definitions and unmapped custom-field values
- Jira identities and the accepted linking decisions
- original values before normalization or mapping
- status/workflow metadata
- worklogs and complete visible changelogs
- visible watcher/voter data and counts, marked partial when permissions limit identities
- parent, subtask, hierarchy, and issue-link records
- unsupported Jira Software, Jira Service Management, Jira Product Discovery, and app-defined data that was detectable
- skipped attachments, restricted records, unsupported content, conversion warnings, and failures with reasons

The human-readable report summarizes source visibility, migrated counts, archived categories, transformations, skips, collisions, and unresolved risks. Unsupported data is not appended to every ticket body.

## Restricted content

ProjectProject permissions are project-wide and cannot reproduce Jira issue/comment/worklog visibility restrictions.

Preflight detects restriction metadata available to the connected account. Before confirmation, the user must choose one of:

- exclude restricted content and record it in the report
- include it after acknowledging that all destination project members may be able to see it
- cancel the migration

The report never claims that inaccessible restricted content was absent. It distinguishes excluded visible records from records that may have been hidden entirely by Jira permissions.

## Attachments

The migration follows ProjectProject's current attachment policy: PNG, JPEG, GIF, WebP, AVIF, PDF, ZIP, GZIP, and TAR files up to 25 MiB.

Preflight lists oversized files, unsupported MIME types, and files Jira did not permit the account to download. The user may continue with those items skipped or cancel. Each skipped attachment is recorded with its issue, filename, source metadata, reason, and Jira URL when available.

Expanding attachment limits or accepted file types is separate work and is not hidden inside this migration.

## Product-specific Jira boundaries

The migration extracts the underlying project, issues, comments, attachments, and general Jira fields from any Jira Cloud project visible to the connected account.

The first release promises full interpretation only for Jira Software and Jira Work Management projects.

For Jira Service Management and Jira Product Discovery projects, the scan detects and reports unsupported product-specific data where possible. This includes requests, customers, organizations, SLAs, forms, approvals, Assets, queues, knowledge links, idea insights, view configuration, and product-specific voting semantics. These features are not silently presented as migrated.

## Authorization

Jira migration uses the existing ProjectProject project-creation permission. Anyone who can create a normal project in the destination organization can run a migration. No migration-specific ProjectProject role is introduced.

The Jira OAuth connection belongs to the initiating user. The destination project follows ordinary ProjectProject visibility and membership rules.

## Paper design gate

Implementation does not begin until the full wizard has been designed, reviewed, and approved in Paper.

The Paper deliverable must:

- use the exact current ProjectProject app chrome and design system
- be high fidelity rather than schematic
- cover connection, source selection, scanning, account linking, field/status mapping, review, restrictions, progress, failure/resume, and completion
- include the primary desktop flow in light and dark themes
- include responsive treatments for dense mapping and review screens
- include loading, empty, warning, destructive, partial-success, retry, cancellation, and completion states
- be linked from the migration ticket after approval

The delivery order is:

1. Run the Jira identity and API feasibility spike against a real Jira Cloud project.
2. Adjust and finalize the migration contract from the spike findings.
3. Design every wizard state in Paper with exact ProjectProject chrome.
4. Review and approve light/dark, responsive, progress, warning, failure, resume, and completion behavior.
5. Link the approved Paper file to the migration ticket.
6. Produce the implementation plan and begin construction.

## Acceptance criteria

- A permitted user can connect a Jira Cloud account through OAuth 2.0 3LO and select an accessible project.
- Scanning creates a resumable, versioned manifest without creating a visible destination project.
- The scan and report qualify coverage as visible to the connected Jira account and identify permission-limited categories.
- The wizard requires explicit identity, status, issue-type, priority, and collision decisions before migration.
- Every Jira identity can be explicitly linked or left unlinked; no placeholder users are created.
- Unlinked historical comments remain visible with a read-only Jira author snapshot.
- Compatible Jira issue keys become the real ProjectProject ticket IDs, preserving gaps.
- Jira labels, components, epics, versions, and sprints follow the approved destination mappings.
- Subtasks become ordinary tickets, and unsupported relationships remain recoverable in the archive.
- Internal migrated links are rewritten and external Jira links remain intact.
- Supported rich text and attachments migrate; loss, unsupported constructs, and skipped files are itemized.
- Restricted content cannot be migrated without an explicit exclusion or disclosure decision.
- Jira Service Management and Jira Product Discovery-specific gaps are detected and reported where possible.
- The migration resumes safely after transient failures and rate limits.
- A failed or cancelled migration exposes no partial project.
- A successful project includes its versioned archive and readable report under `imports/jira/<migration-id>/`.
- Epic and milestone data is usable in the frontend before Jira migration is released.
- The high-fidelity Paper design is approved and linked before implementation begins.

## Validation fixtures

Implementation planning must include fixtures and tests for:

- company-managed and team-managed Jira Software projects
- Jira Work Management projects
- detectable Jira Service Management and Jira Product Discovery data
- hidden emails, inactive/deleted users, service accounts, and explicit non-linking
- restricted issues, comments, attachments, and worklogs
- multiple Jira Done-category statuses mapped to ProjectProject `done`
- custom statuses created as non-terminal statuses
- custom issue types and priority schemes
- tag normalization and collisions
- epics, releases, active/future/completed sprints, and historical sprint membership
- subtasks, cross-project links, and rewritten internal links
- common and unsupported ADF nodes
- oversized, unsupported, missing, and transiently failing attachments
- incompatible project keys, ID collisions, and issue-number gaps
- pagination, `429` handling, interruption, retry, cancellation, and atomic publication

## Open implementation work after design approval

- Register and configure the Atlassian OAuth application and exact least-privilege scopes.
- Validate Jira identity exposure and product/project detection in the feasibility spike.
- Specify the manifest schema and versioning policy in the implementation plan.
- Specify encrypted-token lifecycle, revocation, and retention in the implementation plan.
- Define the narrow imported-comment-author API/schema changes.
- Confirm the atomic staging/publish mechanism against the current markdown and Postgres stores.
- Complete or surface the existing epic and milestone frontend paths before release.
