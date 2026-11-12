import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { blockLookupFor, type BlockIconName, type Library } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useMemo, type ReactNode } from "react"

import { ReadFailure } from "@/components/shell/ReadFailure"
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
  USAGE_PROJECT_LIMIT
} from "../atoms/libraryUsage"
import { templateSketch } from "../lib/blockSketchModel"
import { standingOf } from "../lib/entryStanding"
import type { LibraryKind } from "../lib/libraryModel"
import { entryUsage, type EntryUsage, type UsageProject } from "../lib/orgUsage"
import { usageBySection } from "../lib/sectionUsage"
import { BlockStrip } from "./BlockSketch"
import { ChangedHereBadge, SameOnEveryTicketBadge } from "./EntryBadges"
import { ENTRY_GRID_CLASS, EntryCard, NewEntryCard } from "./EntryCard"
import { LibraryEmpty } from "./LibraryEmpty"
import { sectionUseText } from "./ProjectEntryGroups"

type OrgScope = Extract<LibraryScope, { layer: "org" }>

type OrgListProps = Readonly<{
  scope: OrgScope
  library: Library
  canCreate: boolean
}>

type Row = Readonly<{
  key: string
  name: string
  icon: BlockIconName
  color: string | null
  changed: boolean
  badges: ReactNode
  detail: string
  strip?: ReactNode
}>

export function OrgTypeList({ scope, library, canCreate }: OrgListProps) {
  const lookup = useMemo(() => blockLookupFor(library), [library])
  return (
    <OrgEntryList
      scope={scope}
      kind="type"
      canCreate={canCreate}
      note={m.templates_types_org_note()}
      rows={library.types.map((type) => ({
        key: type.key,
        name: type.name,
        icon: type.icon,
        color: type.color,
        changed: standingOf(type, "org") === "changed",
        badges: null,
        detail: type.description,
        strip: <BlockStrip blocks={templateSketch(type.body, lookup, 0)} />
      }))}
    />
  )
}

export function OrgSectionList({ scope, library, canCreate }: OrgListProps) {
  const usedBy = useMemo(() => usageBySection(library), [library])
  return (
    <OrgEntryList
      scope={scope}
      kind="section"
      canCreate={canCreate}
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
  note,
  canCreate
}: Readonly<{
  scope: OrgScope
  kind: LibraryKind
  rows: ReadonlyArray<Row>
  note: string
  canCreate: boolean
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
      <ul className={ENTRY_GRID_CLASS}>
        {rows.map((row) => (
          <EntryCard
            key={row.key}
            scope={scope}
            kind={kind}
            entry={row}
            badges={
              <>
                {row.badges}
                {row.changed ? <ChangedHereBadge /> : null}
              </>
            }
            detail={row.detail}
            strip={row.strip}
            footer={
              loaded === null || !loaded.complete ? null : (
                <>
                  <span>
                    {asIsText(entryUsage(loaded.libraries, kind, row.key))}
                  </span>
                  <UsageBadges
                    usage={entryUsage(loaded.libraries, kind, row.key)}
                  />
                </>
              )
            }
          />
        ))}
        {canCreate ? <NewEntryCard scope={scope} kind={kind} /> : null}
      </ul>
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

export const asIsText = (usage: EntryUsage): string => {
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
