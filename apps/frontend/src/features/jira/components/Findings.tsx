import type { JiraMigrationFinding } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { AutoHeight } from "@/components/ui/auto-height"
import { Button } from "@/components/ui/button"
import {
  groupJiraFindings,
  type JiraFindingGroup
} from "@/features/jira/lib/findings"
import { TicketIdText } from "@/features/tickets/components/TicketIdText"
import { textLinkClass } from "@/lib/textLink"
import { m } from "@/paraglide/messages"

import { FactList, FactRow } from "./Facts"

const COLLAPSED_ROWS = 5

export type FindingsProject = Readonly<{ orgSlug: string; slug: string }>

export function JiraFindings({
  findings,
  project
}: Readonly<{
  findings: ReadonlyArray<JiraMigrationFinding>
  project: FindingsProject | null
}>) {
  return (
    <div className="flex flex-col gap-6">
      {groupJiraFindings(findings).map((group) => (
        <FindingGroup key={group.kind} group={group} project={project} />
      ))}
    </div>
  )
}

function FindingGroup({
  group,
  project
}: Readonly<{ group: JiraFindingGroup; project: FindingsProject | null }>) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = group.findings.length > COLLAPSED_ROWS
  const visible =
    collapsible && !expanded
      ? group.findings.slice(0, COLLAPSED_ROWS)
      : group.findings
  const unknownKind = group.title === null
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-baseline gap-2 text-body">
        <span className="font-semibold text-foreground">
          {group.title ?? m.jira_import_finding_other()}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {m.jira_import_count({ count: group.findings.length })}
        </span>
      </h4>
      <AutoHeight>
        <FactList>
          {visible.map((finding) => (
            <FactRow
              key={`${finding.sourceId ?? ""}:${finding.ticketId ?? ""}:${finding.subject}`}
              label={finding.subject}
              note={unknownKind ? undefined : finding.consequence}
            >
              <FindingLinks
                finding={finding}
                project={project}
                fallback={unknownKind ? finding.consequence : null}
              />
            </FactRow>
          ))}
        </FactList>
      </AutoHeight>
      {collapsible ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded
              ? m.jira_import_findings_show_less()
              : m.jira_import_findings_show_all({
                  count: group.findings.length
                })}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function FindingLinks({
  finding,
  project,
  fallback
}: Readonly<{
  finding: JiraMigrationFinding
  project: FindingsProject | null
  fallback: string | null
}>) {
  const ticketId = finding.ticketId
  return (
    <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {fallback === null ? null : <span>{fallback}</span>}
      {ticketId !== null && project !== null ? (
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{
            orgSlug: project.orgSlug,
            slug: project.slug,
            id: ticketId
          }}
          className={textLinkClass}
        >
          <TicketIdText id={ticketId}>
            {m.jira_import_result_open_ticket({ ticket: ticketId })}
          </TicketIdText>
        </Link>
      ) : null}
      {finding.jiraUrl === null ? null : (
        <a
          href={finding.jiraUrl}
          target="_blank"
          rel="noreferrer"
          className={textLinkClass}
        >
          {m.jira_import_finding_open_in_jira()}
        </a>
      )}
    </span>
  )
}
