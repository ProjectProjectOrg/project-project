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

import { Button } from "@/components/ui/button"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { ProjectLibraryRequest } from "../atoms/library"
import {
  removeBlockAtom,
  removeTypeAtom,
  type LibraryScope
} from "../atoms/libraryScope"
import { templateSketch } from "../lib/blockSketchModel"
import {
  groupEntries,
  standingOf,
  type LibraryPermissions
} from "../lib/entryStanding"
import type { LibraryKind } from "../lib/libraryModel"
import { usageBySection } from "../lib/sectionUsage"
import { BlockIconGlyph } from "./BlockIconGlyph"
import { BlockStrip } from "./BlockSketch"
import { ChangedHereBadge, SameOnEveryTicketBadge } from "./EntryBadges"
import { ENTRY_GRID_CLASS, EntryCard, NewEntryCard } from "./EntryCard"

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
  const groups = groupEntries(library.types, scope.layer)
  const card = (type: TypeDefinition) => (
    <EntryCard
      key={type.key}
      scope={scope}
      kind="type"
      entry={type}
      badges={
        standingOf(type, scope.layer) === "changed" ? (
          <ChangedHereBadge />
        ) : null
      }
      detail={type.description}
      strip={<BlockStrip blocks={templateSketch(type.body, lookup, 0)} />}
    />
  )
  return (
    <EntryGroups
      scope={scope}
      kind="type"
      permissions={permissions}
      shared={groups.shared.map(card)}
      own={groups.own.map(card)}
      hidden={groups.hidden.map((type) => (
        <HiddenEntry key={type.key} entry={type}>
          {permissions.project ? (
            <ShowTypeAgain req={scope.req} typeKey={type.key} />
          ) : null}
        </HiddenEntry>
      ))}
    />
  )
}

export function ProjectSectionGroups({
  scope,
  library,
  permissions
}: GroupsProps) {
  const usage = useMemo(() => usageBySection(library), [library])
  const groups = groupEntries(library.blocks, scope.layer)
  const card = (section: BlockDefinition) => (
    <EntryCard
      key={section.key}
      scope={scope}
      kind="section"
      entry={section}
      badges={
        <>
          {section.sync ? <SameOnEveryTicketBadge /> : null}
          {standingOf(section, scope.layer) === "changed" ? (
            <ChangedHereBadge />
          ) : null}
        </>
      }
      detail={sectionUseText(usage.get(section.key) ?? [])}
    />
  )
  return (
    <EntryGroups
      scope={scope}
      kind="section"
      permissions={permissions}
      shared={groups.shared.map(card)}
      own={groups.own.map(card)}
      hidden={groups.hidden.map((section) => (
        <HiddenEntry key={section.key} entry={section}>
          {permissions.project ? (
            <ShowSectionAgain req={scope.req} sectionKey={section.key} />
          ) : null}
        </HiddenEntry>
      ))}
    />
  )
}

function EntryGroups({
  scope,
  kind,
  permissions,
  shared,
  own,
  hidden
}: Readonly<{
  scope: ProjectScope
  kind: LibraryKind
  permissions: LibraryPermissions
  shared: ReadonlyArray<ReactNode>
  own: ReadonlyArray<ReactNode>
  hidden: ReadonlyArray<ReactNode>
}>) {
  const canCreate = permissions.project || permissions.org
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <GroupHeading
          icon={<Building2 aria-hidden className="size-3.5" />}
          title={m.templates_types_group_shared()}
          note={m.templates_types_group_shared_note()}
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
        {hidden.length === 0 ? null : (
          <div
            data-hidden-entries
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-caption text-muted-foreground"
          >
            <span>
              {hidden.length === 1
                ? m.templates_types_hidden_one()
                : m.templates_types_hidden_count({ count: hidden.length })}
            </span>
            {hidden}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <GroupHeading
          icon={<Folder aria-hidden className="size-3.5" />}
          title={m.templates_types_group_own()}
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
  title: string
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

function HiddenEntry({
  entry,
  children
}: Readonly<{
  entry: Readonly<{
    key: string
    name: string
    icon: TypeDefinition["icon"]
  }>
  children: ReactNode
}>) {
  return (
    <span
      data-hidden-entry={entry.key}
      className="inline-flex items-center gap-1.5"
    >
      <BlockIconGlyph icon={entry.icon} className="size-3.5 opacity-70" />
      <span className="text-foreground">{entry.name}</span>
      {children}
    </span>
  )
}

function ShowAgainButton({
  waiting,
  error,
  onShow
}: Readonly<{ waiting: boolean; error: string | null; onShow: () => void }>) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={cn(waiting && "animate-pulse")}
        onClick={onShow}
      >
        {m.templates_types_show_again()}
      </Button>
      {error === null ? null : (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </>
  )
}

function ShowTypeAgain({
  req,
  typeKey
}: Readonly<{ req: ProjectLibraryRequest; typeKey: TypeKey }>) {
  const mutation = removeTypeAtom({ layer: "project", req }, typeKey)
  const show = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  return (
    <ShowAgainButton
      waiting={state.waiting}
      error={mutationErrorText(state)}
      onShow={() => void show()}
    />
  )
}

function ShowSectionAgain({
  req,
  sectionKey
}: Readonly<{ req: ProjectLibraryRequest; sectionKey: BlockKey }>) {
  const mutation = removeBlockAtom({ layer: "project", req }, sectionKey)
  const show = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  return (
    <ShowAgainButton
      waiting={state.waiting}
      error={mutationErrorText(state)}
      onShow={() => void show()}
    />
  )
}
