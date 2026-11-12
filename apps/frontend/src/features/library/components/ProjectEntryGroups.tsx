import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  blockLookupFor,
  type BlockDefinition,
  type BlockKey,
  type Library,
  type TypeDefinition,
  type TypeKey
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { Building2, Folder } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  hideProjectBlock,
  hideProjectType,
  type ProjectLibraryRequest
} from "../atoms/library"
import {
  removeBlockAtom,
  removeTypeAtom,
  type LibraryScope
} from "../atoms/libraryScope"
import { useScopeProjectName } from "../hooks/useLibraryPermissions"
import { templateSketch } from "../lib/blockSketchModel"
import {
  groupEntries,
  standingOf,
  type EntryStanding,
  type LibraryPermissions
} from "../lib/entryStanding"
import type { LibraryKind } from "../lib/libraryModel"
import { usageBySection } from "../lib/sectionUsage"
import { BlockStrip } from "./BlockSketch"
import {
  ChangedHereBadge,
  OffHereBadge,
  SameOnEveryTicketBadge
} from "./EntryBadges"
import { ENTRY_GRID_CLASS, EntryCard, NewEntryCard } from "./EntryCard"
import { ProjectChip } from "./ProjectChip"

type ProjectScope = Extract<LibraryScope, { layer: "project" }>

type GroupsProps = Readonly<{
  scope: ProjectScope
  library: Library
  permissions: LibraryPermissions
}>

export const sectionUseText = (
  types: ReadonlyArray<Readonly<{ name: string }>>
): string =>
  types.length === 0
    ? m.templates_sections_in_none()
    : m.templates_sections_in({
        types: types.map((type) => type.name).join(", ")
      })

export function ProjectTypeGroups({
  scope,
  library,
  permissions
}: GroupsProps) {
  const lookup = useMemo(() => blockLookupFor(library), [library])
  const { shared, own } = splitByOwner(library.types, scope.layer)
  const card = (type: TypeDefinition) => {
    const standing = standingOf(type, scope.layer)
    return (
      <EntryCard
        key={type.key}
        scope={scope}
        kind="type"
        entry={type}
        off={standing === "hidden"}
        badges={
          <StandingBadge
            scope={scope}
            standing={standing}
            switched={permissions.project}
          />
        }
        control={
          permissions.project && isSwitchable(standing) ? (
            <TypeSwitch
              req={scope.req}
              typeKey={type.key}
              name={type.name}
              on={standing === "shared"}
            />
          ) : null
        }
        detail={type.description}
        strip={<BlockStrip blocks={templateSketch(type.body, lookup, 0)} />}
      />
    )
  }
  return (
    <EntryGroups
      scope={scope}
      kind="type"
      permissions={permissions}
      shared={shared.map(card)}
      own={own.map(card)}
    />
  )
}

export function ProjectSectionGroups({
  scope,
  library,
  permissions
}: GroupsProps) {
  const usage = useMemo(() => usageBySection(library), [library])
  const { shared, own } = splitByOwner(library.blocks, scope.layer)
  const card = (section: BlockDefinition) => {
    const standing = standingOf(section, scope.layer)
    return (
      <EntryCard
        key={section.key}
        scope={scope}
        kind="section"
        entry={section}
        off={standing === "hidden"}
        badges={
          <>
            {section.sync ? <SameOnEveryTicketBadge /> : null}
            <StandingBadge
              scope={scope}
              standing={standing}
              switched={permissions.project}
            />
          </>
        }
        control={
          permissions.project && isSwitchable(standing) ? (
            <SectionSwitch
              req={scope.req}
              sectionKey={section.key}
              name={section.name}
              on={standing === "shared"}
            />
          ) : null
        }
        detail={sectionUseText(usage.get(section.key) ?? [])}
      />
    )
  }
  return (
    <EntryGroups
      scope={scope}
      kind="section"
      permissions={permissions}
      shared={shared.map(card)}
      own={own.map(card)}
    />
  )
}

const splitByOwner = <A extends Parameters<typeof standingOf>[0]>(
  entries: ReadonlyArray<A>,
  layer: LibraryScope["layer"]
) => {
  const { own } = groupEntries(entries, layer)
  return { shared: entries.filter((entry) => !own.includes(entry)), own }
}

const isSwitchable = (standing: EntryStanding): boolean =>
  standing === "shared" || standing === "hidden"

function StandingBadge({
  scope,
  standing,
  switched
}: Readonly<{
  scope: ProjectScope
  standing: EntryStanding
  switched: boolean
}>) {
  const project = useScopeProjectName(scope)
  if (standing === "changed") return <ChangedHereBadge project={project} />
  return standing === "hidden" && !switched ? <OffHereBadge /> : null
}

function EntryGroups({
  scope,
  kind,
  permissions,
  shared,
  own
}: Readonly<{
  scope: ProjectScope
  kind: LibraryKind
  permissions: LibraryPermissions
  shared: ReadonlyArray<ReactNode>
  own: ReadonlyArray<ReactNode>
}>) {
  const canCreate = permissions.project || permissions.org
  const project = useScopeProjectName(scope)
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <GroupHeading
          icon={<Building2 aria-hidden className="size-3.5" />}
          title={m.templates_types_group_shared()}
          note={
            permissions.project
              ? m.templates_types_group_shared_note_switch({ project })
              : m.templates_types_group_shared_note()
          }
          action={
            permissions.org ? (
              <Link
                to="/orgs/$orgSlug/settings/types"
                params={{ orgSlug: scope.req.params.orgSlug }}
                search={kind === "section" ? { tab: "sections" } : {}}
                className="rounded-sm text-caption text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              >
                {m.templates_types_org_settings_link()}
              </Link>
            ) : null
          }
        />
        <ul className={ENTRY_GRID_CLASS}>{shared}</ul>
      </section>
      <section className="flex flex-col gap-3">
        <GroupHeading
          icon={<Folder aria-hidden className="size-3.5" />}
          title={
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {m.templates_types_group_own()}
              <ProjectChip scope={scope} />
            </span>
          }
        />
        {own.length === 0 && !canCreate ? (
          <p className="px-0.5 text-caption text-muted-foreground">
            {kind === "type"
              ? m.templates_types_group_own_empty()
              : m.templates_sections_group_own_empty()}
          </p>
        ) : (
          <ul className={ENTRY_GRID_CLASS}>
            {own}
            {canCreate ? <NewEntryCard scope={scope} kind={kind} /> : null}
          </ul>
        )}
      </section>
    </div>
  )
}

function GroupHeading({
  icon,
  title,
  note,
  action
}: Readonly<{
  icon: ReactNode
  title: ReactNode
  note?: string
  action?: ReactNode
}>) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-0.5">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-body font-semibold">{title}</h2>
      {note === undefined ? null : (
        <span className="text-caption text-muted-foreground">{note}</span>
      )}
      {action === undefined || action === null ? null : (
        <span className="ml-auto">{action}</span>
      )}
    </div>
  )
}

function UseSwitch({
  label,
  hint,
  on,
  waiting,
  error,
  onChange
}: Readonly<{
  label: string
  hint: string
  on: boolean
  waiting: boolean
  error: string | null
  onChange: (on: boolean) => void
}>) {
  return (
    <>
      {error === null ? null : (
        <span role="alert" className="mr-2 text-caption text-destructive">
          {error}
        </span>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <Switch
              checked={on}
              aria-label={label}
              onCheckedChange={onChange}
              className={cn(waiting && "animate-pulse")}
            />
          }
        />
        <TooltipContent className="max-w-64">{hint}</TooltipContent>
      </Tooltip>
    </>
  )
}

function TypeSwitch({
  req,
  typeKey,
  name,
  on
}: Readonly<{
  req: ProjectLibraryRequest
  typeKey: TypeKey
  name: string
  on: boolean
}>) {
  const hideAtom = hideProjectType({ req, key: typeKey })
  const showAtom = removeTypeAtom({ layer: "project", req }, typeKey)
  const hide = useAtomSet(hideAtom, { mode: "promiseExit" })
  const show = useAtomSet(showAtom, { mode: "promiseExit" })
  const hiding = useAtomValue(hideAtom)
  const showing = useAtomValue(showAtom)
  const project = useScopeProjectName({ layer: "project", req })
  return (
    <UseSwitch
      label={m.templates_types_use_aria({ name, project })}
      hint={
        on
          ? m.templates_types_use_type_on({ name, project })
          : m.templates_types_use_type_off({ name, project })
      }
      on={on}
      waiting={hiding.waiting || showing.waiting}
      error={mutationErrorText(hiding) ?? mutationErrorText(showing)}
      onChange={(next) => void (next ? show() : hide())}
    />
  )
}

function SectionSwitch({
  req,
  sectionKey,
  name,
  on
}: Readonly<{
  req: ProjectLibraryRequest
  sectionKey: BlockKey
  name: string
  on: boolean
}>) {
  const hideAtom = hideProjectBlock({ req, key: sectionKey })
  const showAtom = removeBlockAtom({ layer: "project", req }, sectionKey)
  const hide = useAtomSet(hideAtom, { mode: "promiseExit" })
  const show = useAtomSet(showAtom, { mode: "promiseExit" })
  const hiding = useAtomValue(hideAtom)
  const showing = useAtomValue(showAtom)
  const project = useScopeProjectName({ layer: "project", req })
  return (
    <UseSwitch
      label={m.templates_types_use_aria({ name, project })}
      hint={
        on
          ? m.templates_types_use_section_on({ name, project })
          : m.templates_types_use_section_off({ name, project })
      }
      on={on}
      waiting={hiding.waiting || showing.waiting}
      error={mutationErrorText(hiding) ?? mutationErrorText(showing)}
      onChange={(next) => void (next ? show() : hide())}
    />
  )
}
