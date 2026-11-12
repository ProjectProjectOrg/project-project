import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { BlockIconName, Library } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useMemo, type ReactNode } from "react"

import { ReadFailure } from "@/components/shell/ReadFailure"
import { SettingsGroup } from "@/components/shell/settings/SettingsSection"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { m } from "@/paraglide/messages"

import type { LibraryScope } from "../atoms/libraryScope"
import {
  libraryUsage,
  libraryUsageRequest,
  USAGE_PROJECT_LIMIT,
  type LibraryUsage
} from "../atoms/libraryUsage"
import { standingOf } from "../lib/entryStanding"
import type { LibraryKind } from "../lib/libraryModel"
import { entryUsage, type EntryUsage, type UsageProject } from "../lib/orgUsage"
import { usageBySection } from "../lib/sectionUsage"
import { BlockIconGlyph } from "./BlockIconGlyph"
import { ChangedHereBadge, SameOnEveryTicketBadge } from "./EntryBadges"
import { LibraryEmpty } from "./LibraryEmpty"
import { LibraryEntryLink } from "./LibraryEntryLink"
import { sectionUseText } from "./ProjectEntryGroups"

type OrgScope = Extract<LibraryScope, { layer: "org" }>

type OrgListProps = Readonly<{ scope: OrgScope; library: Library }>

type Row = Readonly<{
  key: string
  name: string
  icon: BlockIconName
  color: string | null
  changed: boolean
  badges: ReactNode
  detail: string | null
}>

export function OrgTypeList({ scope, library }: OrgListProps) {
  return (
    <OrgEntryList
      scope={scope}
      kind="type"
      note={m.templates_types_org_note()}
      rows={library.types.map((type) => ({
        key: type.key,
        name: type.name,
        icon: type.icon,
        color: type.color,
        changed: standingOf(type, "org") === "changed",
        badges: null,
        detail: null
      }))}
    />
  )
}

export function OrgSectionList({ scope, library }: OrgListProps) {
  const usedBy = useMemo(() => usageBySection(library), [library])
  return (
    <OrgEntryList
      scope={scope}
      kind="section"
      note={m.templates_sections_org_note()}
      rows={library.blocks.map((section) => ({
        key: section.key,
        name: section.name,
        icon: section.icon,
        color: section.color,
        changed: standingOf(section, "org") === "changed",
        badges: section.sync ? <SameOnEveryTicketBadge /> : null,
        detail: sectionUseText(usedBy.get(section.key) ?? [])
      }))}
    />
  )
}

function OrgEntryList({
  scope,
  kind,
  rows,
  note
}: Readonly<{
  scope: OrgScope
  kind: LibraryKind
  rows: ReadonlyArray<Row>
  note: string
}>) {
  const usageAtom = libraryUsage(libraryUsageRequest(scope.req.params.orgSlug))
  const usage = useAtomValue(usageAtom)
  const refreshUsage = useAtomRefresh(usageAtom)
  const loaded = AsyncResult.isSuccess(usage) ? usage.value : null

  if (rows.length === 0)
    return (
      <LibraryEmpty
        caption={
          kind === "type"
            ? m.templates_types_empty()
            : m.templates_sections_empty()
        }
      />
    )

  return (
    <div className="flex flex-col gap-3">
      <SettingsGroup render={<ul />}>
        {rows.map((row) => (
          <li
            key={row.key}
            data-entry-row={row.key}
            className="relative flex min-h-12 flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 transition-colors hover:bg-hover"
          >
            <LibraryEntryLink
              scope={scope}
              kind={kind}
              entryKey={row.key}
              aria-label={row.name}
              className="absolute inset-0 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            />
            <BlockIconGlyph icon={row.icon} color={row.color} />
            <span className="min-w-0 truncate text-body font-semibold">
              {row.name}
            </span>
            {row.badges}
            {row.changed ? <ChangedHereBadge /> : null}
            <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
              {loaded === null || !loaded.complete ? null : (
                <UsageBadges
                  usage={entryUsage(loaded.libraries, kind, row.key)}
                />
              )}
              <span className="text-caption text-muted-foreground">
                {usageLine(row.detail, usage, kind, row.key)}
              </span>
            </span>
          </li>
        ))}
      </SettingsGroup>
      {AsyncResult.isFailure(usage) ? (
        <ReadFailure
          failure={AsyncResult.matchWithError(usage, {
            onInitial: () => ({ kind: "defect", defect: null }) as const,
            onSuccess: () => ({ kind: "defect", defect: null }) as const,
            onError: (error) => ({ kind: "error", error }) as const,
            onDefect: (defect) => ({ kind: "defect", defect }) as const
          })}
          onRetry={refreshUsage}
          className="px-0.5"
        />
      ) : null}
      {loaded !== null && !loaded.complete ? (
        <p className="px-0.5 text-caption text-muted-foreground">
          {m.templates_types_usage_too_many({ count: USAGE_PROJECT_LIMIT })}
        </p>
      ) : null}
      <p className="px-0.5 text-caption text-muted-foreground">{note}</p>
    </div>
  )
}

const asIsText = (usage: EntryUsage): string => {
  if (usage.projects === 0) return m.templates_types_usage_no_projects()
  if (usage.asIs === usage.projects)
    return usage.projects === 1
      ? m.templates_types_usage_all_one()
      : m.templates_types_usage_all({ count: usage.projects })
  if (usage.asIs === 0) return m.templates_types_usage_none()
  return usage.asIs === 1
    ? m.templates_types_usage_some_one()
    : m.templates_types_usage_some({ count: usage.asIs })
}

const usageLine = (
  detail: string | null,
  usage: AsyncResult.AsyncResult<LibraryUsage, unknown>,
  kind: LibraryKind,
  key: string
): string => {
  const asIs =
    AsyncResult.isSuccess(usage) && usage.value.complete
      ? asIsText(entryUsage(usage.value.libraries, kind, key))
      : null
  if (detail === null) return asIs ?? ""
  return asIs === null
    ? detail
    : m.templates_types_usage_joined({ detail, usage: asIs })
}

function UsageBadges({ usage }: Readonly<{ usage: EntryUsage }>) {
  return (
    <>
      <ProjectsBadge
        tone="amber"
        projects={usage.changedIn}
        one={(project) => m.templates_types_changed_in({ project })}
        many={(count) => m.templates_types_changed_in_count({ count })}
      />
      <ProjectsBadge
        tone="muted"
        projects={usage.hiddenIn}
        one={(project) => m.templates_types_hidden_in({ project })}
        many={(count) => m.templates_types_hidden_in_count({ count })}
      />
    </>
  )
}

function ProjectsBadge({
  tone,
  projects,
  one,
  many
}: Readonly<{
  tone: "amber" | "muted"
  projects: ReadonlyArray<UsageProject>
  one: (project: string) => string
  many: (count: number) => string
}>) {
  if (projects.length === 0) return null
  if (projects.length === 1)
    return (
      <Badge size="xs" tone={tone} className="max-w-48 truncate">
        {one(projects[0].name)}
      </Badge>
    )
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge size="xs" tone={tone} className="relative" tabIndex={0} />
        }
      >
        {many(projects.length)}
      </TooltipTrigger>
      <TooltipContent>
        {projects.map((project) => project.name).join(", ")}
      </TooltipContent>
    </Tooltip>
  )
}
