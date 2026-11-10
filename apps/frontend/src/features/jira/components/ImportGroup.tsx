import type { JiraMigrationSummary } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { useRef } from "react"

import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import { formatDateTime } from "@/features/jira/lib/format"
import {
  isRunningJiraImport,
  jiraProgressRatio
} from "@/features/jira/lib/imports"
import { jiraImportStatusLabel } from "@/features/jira/lib/stages"
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/useFluidHover"
import { m } from "@/paraglide/messages"

import { ProgressBar } from "./ProgressBar"

export function ImportGroup({
  orgSlug,
  title,
  imports
}: Readonly<{
  orgSlug: string
  title: string
  imports: ReadonlyArray<JiraMigrationSummary>
}>) {
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-3 text-[13px] font-medium text-foreground">{title}</h2>
      <div
        ref={listRef}
        role="presentation"
        onMouseEnter={hover.handlers.onMouseEnter}
        onMouseMove={hover.handlers.onMouseMove}
        onMouseLeave={hover.handlers.onMouseLeave}
        onClick={hover.handlers.onClick}
        className="relative"
      >
        <FluidHoverHighlight hover={hover} className="rounded-lg" />
        <ul className="flex flex-col">
          {imports.map((summary, index) => (
            <ImportRow
              key={summary.id}
              orgSlug={orgSlug}
              summary={summary}
              index={index}
              registerItem={hover.registerItem}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}

function ImportRow({
  orgSlug,
  summary,
  index,
  registerItem
}: Readonly<{
  orgSlug: string
  summary: JiraMigrationSummary
  index: number
  registerItem: (index: number, element: HTMLElement | null) => void
}>) {
  const ref = useRef<HTMLAnchorElement>(null)
  useRegisterFluidHoverItem(registerItem, index, ref)
  const ratio = isRunningJiraImport(summary)
    ? jiraProgressRatio(summary.progress)
    : null
  const status = jiraImportStatusLabel(summary.status)
  const destination = summary.destination ?? null
  const projectSlug =
    summary.status === "succeeded" ? summary.destinationProjectSlug : null
  const className =
    "relative z-10 grid h-9 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 rounded-lg px-3 text-[13px] text-foreground transition-transform duration-100 active:scale-[0.97]"
  const content = (
    <>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
          {summary.sourceProjectKey}
        </span>
        <span className="truncate">{summary.sourceProjectName}</span>
        {destination === null ? null : (
          <>
            <span aria-hidden className="shrink-0 text-muted-foreground">
              {m.jira_import_row_arrow()}
            </span>
            <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
              {destination.key}
            </span>
            <span className="truncate text-muted-foreground">
              {destination.name}
            </span>
          </>
        )}
      </span>
      <span className="flex items-center gap-2 text-muted-foreground">
        {ratio === null ? null : (
          <ProgressBar ratio={ratio} label={status} size="compact" />
        )}
        <span>{status}</span>
      </span>
      <span className="text-muted-foreground tabular-nums">
        {formatDateTime(summary.updatedAt)}
      </span>
    </>
  )
  return (
    <li>
      {projectSlug === null ? (
        <Link
          ref={ref}
          to="/orgs/$orgSlug/migrations/jira/$migrationId"
          params={{ orgSlug, migrationId: summary.id }}
          className={className}
        >
          {content}
        </Link>
      ) : (
        <Link
          ref={ref}
          to="/orgs/$orgSlug/projects/$slug"
          params={{ orgSlug, slug: projectSlug }}
          className={className}
        >
          {content}
        </Link>
      )}
    </li>
  )
}
