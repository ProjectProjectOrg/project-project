# Jira Cloud migration feasibility spike

Date: 2026-09-14

Related: [T-172](https://projectproject.missler.xyz/orgs/project-project/projects/project-project/tickets/T-172)

## Outcome

The Jira Cloud migration is feasible with a resource-level OAuth 2.0 (3LO) app and read-only scopes. A real, non-disposable Jira Software Cloud project was inspected without writing to Jira. The API surface covers the project, issues, hierarchy, people, comments, attachments, statuses, boards, sprints, versions, components, and changelogs needed by the proposed migration.

The spike validates the proposed explicit account-linking step. Jira exposed an email address for only 1 of the 10 people referenced by the sampled project data, so email can be a matching signal but cannot be the primary identity strategy.

## OAuth and access

The resource-level grant successfully restricted consent to one selected Jira site. The token contained only read scopes plus `offline_access`, and a rotating refresh token was exchanged successfully before repeating an authenticated project read.

Scopes exercised successfully:

- `read:jira-work`
- `read:jira-user`
- `read:issue-details:jira`
- `read:jql:jira`
- `read:board-scope:jira-software`
- `read:sprint:jira-software`
- `offline_access`

Production should also request `read:project:jira`. Atlassian documents it as an additional requirement for `GET /rest/agile/1.0/board`, which the wizard needs to discover boards from a selected project. The narrower `GET /rest/agile/1.0/board/{boardId}` and sprint endpoints worked with the scopes above.

No Jira write or administration scopes are required by the migration as currently designed.

## Fixture profile

The inspected fixture was a team-managed Jira Software project with:

- 300 issues across 7 issue types
- 13 statuses across Jira's `new`, `indeterminate`, and `done` categories
- 14 epics and 6 subtasks
- 103 parent relationships and 7 issue links
- 14 comments from 5 comment authors
- 24 attachments
- 8 sprints: 7 closed and 1 active
- no versions, components, worklogs, issue security levels, or restricted comments

The issue types present were Asset, Feature, Story, Subtask, Task, Bug, and Epic. This confirms that the migration cannot rely on Jira's issue-type names being limited to ProjectProject's four ticket types.

## API coverage

| Data | Result | Migration consequence |
| --- | --- | --- |
| Project metadata and style | Available | Detect Jira Software and team-managed projects before analysis. |
| Issues | All 300 paginated successfully with enhanced JQL | Use token pagination and persist the cursor in the resumable analysis job. |
| Statuses | 13 statuses and their Jira categories available | Populate the explicit status-mapping step; default Jira `done` statuses to ProjectProject `done`. |
| Issue types | 7 types, including a custom-shaped type | Pre-fill the agreed type mapping and require confirmation for non-standard types. |
| Parent hierarchy | Parent and subtask relationships available | Create ordinary tickets for subtasks and preserve the source relationship in the archive. |
| Epics | Epic issue type and parent relationships available | Build epic groups even though the ProjectProject epic UI is a release dependency. |
| Boards and sprints | Board-specific read and all 8 sprints available | Import current and completed sprint history; request `read:project:jira` for board discovery. |
| Versions and components | Endpoints available; fixture had none | Keep version-to-milestone and component-to-tag support in the contract, but test populated fixtures separately. |
| Comments | Bodies, authors, timestamps, mentions, and media structures available | Convert ADF and use linked users or the read-only Jira author snapshot. |
| Attachments | Metadata available; authenticated byte-range download returned `206` | Stream eligible attachments; do not buffer complete files during analysis. |
| Changelog | Paginated history available per issue | Archive unsupported history and use it where needed to reconstruct status history. |
| People | Stable account IDs available; email mostly hidden | Never silently match. Show every referenced person in the linking step and allow “Don’t link.” |
| Restricted content | Detectable, but absent from fixture | Keep all three designed policy choices and test with a restricted fixture before release. |
| JSM/JPD data | Project identified as Jira Software | Product detection works; fixtures for JSM and JPD remain required to validate their archive reports. |

## Content conversion findings

Jira descriptions and comments use Atlassian Document Format. The fixture exercised paragraphs, headings, ordered and unordered lists, task lists, hard breaks, rules, inline cards, mentions, and media nodes. The converter therefore needs explicit handling for all of those nodes, plus a loss-report fallback for unknown nodes.

Of the 300 descriptions, 263 were populated. Comments exercised mentions and embedded media. Internal Jira links should be rewritten only after the complete key-remapping table exists; external Jira links remain external.

The fixture used four populated custom fields:

- Rank on all 300 issues
- Development on 219 issues
- Sprint on 145 issues, representing 363 issue-to-sprint memberships
- Start date on 1 issue

Rank and Development have no direct ProjectProject destination and belong in the structured archive/report. Sprint is first-class migration input. Start date should be archived unless the eventual milestone or ticket model gains an agreed destination.

## Attachment findings

All 24 attachments were within ProjectProject's current 25 MiB limit. Three were QuickTime video files, which are outside the current accepted attachment types. The wizard should report those files as skipped while importing the supported JPEG and PNG files.

The API honored a one-byte range request, so the implementation can validate authorization and stream downloads without eagerly loading whole files.

## Identity findings

The project referenced 10 distinct Atlassian accounts across assignee, reporter, creator, and comment-author fields. Only one exposed an email address. Jira account IDs and display names were consistently available in this fixture, and no referenced account was inactive.

Consequences for the migration contract:

- Keep explicit user confirmation even for a unique email match.
- Use Jira account ID as the stable source identity in the snapshot and manifest.
- Permit any person to remain unlinked.
- Store the narrow Jira author snapshot only where authorship must remain visible, such as imported comments.
- Do not create placeholder ProjectProject accounts.
- Test inactive/deleted users and app/service accounts with additional fixtures because the real project did not contain those cases.

## Confirmed contract adjustments

1. Add `read:project:jira` to the production OAuth scope set for board discovery.
2. Treat hidden email as the normal case in the account-linking UX.
3. Model issue-to-sprint membership as many-to-many in the migration snapshot; the fixture contained more memberships than sprint-bearing issues because Jira retains completed sprint history.
4. Include ADF task lists, inline cards, mentions, and media in the first converter contract.
5. Archive populated Rank, Development, and unsupported custom fields with field metadata and values.
6. Stream attachment downloads and report unsupported MIME types individually.

## Remaining pre-release fixtures

The spike removes the feasibility risk but does not cover every Jira shape. Before release, automated or controlled fixtures must cover:

- company-managed Jira Software
- populated versions and components
- restricted issues and comments
- inactive and deleted accounts
- app/service accounts referenced by issue data
- Jira Service Management and Jira Product Discovery product-specific fields
- pagination beyond 100 changelog entries, comments, boards, and sprints
- key collisions and internal-link rewriting
- attachments above the size limit and failed downloads
- unknown ADF nodes and unsupported custom-field value shapes

## References

- [OAuth 2.0 (3LO) apps](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [Jira Software board REST API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/)
- [Jira Software sprint REST API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/)
- [Jira Cloud enhanced JQL search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- [Jira Cloud issue changelogs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-changelog-get)
- [Atlassian Document Format](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/)
