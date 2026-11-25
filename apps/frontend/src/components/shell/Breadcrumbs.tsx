import { useAtomValue } from "@effect/atom-react"
import type { GroupId, TicketId } from "@pp/shared"
import { BreadcrumbItem, Breadcrumbs as Trail } from "@pp/ui/breadcrumbs"
import {
  Link,
  useMatches,
  useRouterState,
  useSearch
} from "@tanstack/react-router"
import * as Data from "effect/Data"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import {
  libraryView,
  orgScope,
  projectScope
} from "@/features/library/atoms/libraryScope"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import { steppedTicket } from "@/features/tickets/atoms/steppedTicket"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { m } from "@/paraglide/messages"

import { Crumb, type CrumbData } from "./crumb"

// A crumb without its own target links to the route that declared it.
const withTarget = (crumb: Crumb, pathname: string) =>
  crumb._tag === "static" || crumb._tag === "org" || crumb._tag === "project"
    ? { ...crumb, to: crumb.to ?? pathname }
    : crumb

// A crumb's key is its identity in the trail. The org, project, sprint and
// ticket crumbs are their role, so moving to another project or stepping to
// the next ticket keeps the crumb and rolls the new name in. The org and
// Profile crumbs are both the scope, so moving between whose settings these
// are does the same. Static titles are how far they sit after the last of
// those, so General and Integrations are the same crumb whether they follow
// the org or a project: losing or gaining the project closes or opens just
// its crumb, while the page title slides along and rolls.
const crumbKeys = (crumbs: ReadonlyArray<Crumb>) => {
  let anchor = -1
  return crumbs.map((crumb, index) => {
    if (crumb._tag === "static" && crumb.role === undefined)
      return `page-${index - anchor - 1}`
    anchor = index
    return crumb._tag === "static" || crumb._tag === "org"
      ? "scope"
      : crumb._tag
  })
}

export function Breadcrumbs({ className }: { className?: string }) {
  const matches = useMatches()
  const crumbs = matches.flatMap(({ loaderData, pathname }) => {
    const data: CrumbData | undefined =
      loaderData && "crumb" in loaderData ? loaderData.crumb : undefined
    if (data === undefined) return []
    const list = "_tag" in data ? [data] : data
    return list.map((crumb) => withTarget(crumb, pathname))
  })
  const keys = crumbKeys(crumbs)
  const last = crumbs.at(-1)
  const lastTicket =
    last !== undefined && Crumb.$is("ticket")(last) ? last : null
  const parent = useTrailParent(lastTicket)
  if (crumbs.length === 0) return null
  return (
    <Trail label={m.nav_breadcrumb_label()} className={className}>
      {crumbs.slice(0, -1).map((crumb, depth) => (
        <CrumbItem key={keys[depth]} crumb={crumb} />
      ))}
      {parent === null || lastTicket === null ? null : (
        <ParentCrumb
          key="parent"
          orgSlug={lastTicket.orgSlug}
          slug={lastTicket.slug}
          parent={parent}
        />
      )}
      {last ? <CrumbItem key={keys.at(-1)} crumb={last} /> : null}
    </Trail>
  )
}

function CrumbItem({ crumb }: Readonly<{ crumb: Crumb }>) {
  return Crumb.$match(crumb, {
    static: (scope) =>
      scope.role === "scope" ? (
        <ScopeCrumb crumb={scope} />
      ) : (
        <BreadcrumbItem
          label={scope.label}
          render={
            scope.to === undefined ? undefined : (
              <Link
                to={scope.to}
                params={scope.params}
                activeOptions={{ exact: true }}
              />
            )
          }
        />
      ),
    org: (org) => <ScopeCrumb crumb={org} />,
    project: ({ orgSlug, slug, to }) => (
      <ProjectCrumb orgSlug={orgSlug} slug={slug} to={to} />
    ),
    ticket: ({ orgSlug, slug, id }) => (
      <TicketCrumb orgSlug={orgSlug} slug={slug} id={id} />
    ),
    sprint: ({ orgSlug, slug, groupId }) => (
      <SprintCrumb orgSlug={orgSlug} slug={slug} groupId={groupId} />
    ),
    library: ({ kind, orgSlug, slug, entryKey }) => (
      <LibraryCrumb
        kind={kind}
        orgSlug={orgSlug}
        slug={slug}
        entryKey={entryKey}
      />
    )
  })
}

// A type or section is always the last crumb, the page, so it never links.
function LibraryCrumb({
  kind,
  orgSlug,
  slug,
  entryKey
}: Readonly<Omit<Data.TaggedEnum.Value<Crumb, "library">, "_tag">>) {
  const result = useAtomValue(
    libraryView(slug === null ? orgScope(orgSlug) : projectScope(orgSlug, slug))
  )
  const entries = Result.isSuccess(result)
    ? kind === "type"
      ? result.value.types
      : result.value.blocks
    : null
  const label =
    entries === null
      ? null
      : (entries.find((entry) => entry.key === entryKey)?.name ?? entryKey)
  return (
    <BreadcrumbItem
      label={label}
      loadingWidth={`${Math.max(entryKey.length, 4)}ch`}
      loadingLabel={m.nav_crumb_loading({ slug: entryKey })}
    />
  )
}

function SprintCrumb({
  orgSlug,
  slug,
  groupId
}: Readonly<{ orgSlug: string; slug: string; groupId: GroupId }>) {
  const result = useAtomValue(
    sprintDetail(sprintRequest(orgSlug, slug, groupId))
  )
  return (
    <BreadcrumbItem
      label={Result.isSuccess(result) ? result.value.name : null}
      loadingWidth={`${Math.max(groupId.length, 4)}ch`}
      loadingLabel={m.nav_crumb_loading({ slug: groupId })}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
          params={{ orgSlug, slug, groupId }}
          activeOptions={{ exact: true }}
        />
      }
    />
  )
}

type OrgResult = Atom.Type<ReturnType<typeof orgDetail>>

const noOrg: Atom.Atom<OrgResult> = Atom.make(Result.initial())

type ScopeCrumbData =
  | Data.TaggedEnum.Value<Crumb, "org">
  | Data.TaggedEnum.Value<Crumb, "static">

// Whose settings these are: Profile or an org. One component for both, so
// moving between them keeps the crumb mounted and rolls the name.
function ScopeCrumb({ crumb }: Readonly<{ crumb: ScopeCrumbData }>) {
  const result = useAtomValue(
    crumb._tag === "org" ? orgDetail(orgRequest(crumb.orgSlug)) : noOrg
  )
  const loadingKey = crumb._tag === "org" ? crumb.orgSlug : crumb.label
  return (
    <BreadcrumbItem
      label={
        crumb._tag === "static"
          ? crumb.label
          : Result.isSuccess(result)
            ? result.value.name
            : null
      }
      loadingWidth={`${Math.max(loadingKey.length, 4)}ch`}
      loadingLabel={m.nav_crumb_loading({ slug: loadingKey })}
      render={
        crumb.to === undefined ? undefined : (
          <Link to={crumb.to} activeOptions={{ exact: true }} />
        )
      }
    />
  )
}

function ProjectCrumb({
  orgSlug,
  slug,
  to
}: Readonly<{ orgSlug: string; slug: string; to: string | undefined }>) {
  const result = useAtomValue(project(projectRequest(orgSlug, slug)))
  return (
    <BreadcrumbItem
      label={Result.isSuccess(result) ? result.value.name : null}
      loadingWidth={`${Math.max(slug.length, 4)}ch`}
      loadingLabel={m.nav_crumb_loading({ slug })}
      render={<Link to={to} activeOptions={{ exact: true }} />}
    />
  )
}

function TicketCrumb({
  orgSlug,
  slug,
  id
}: Readonly<{ orgSlug: string; slug: string; id: TicketId }>) {
  const stepped = useAtomValue(steppedTicket)
  const result = useAtomValue(ticketDetail(ticketRequest(orgSlug, slug, id)))
  const titleHint = useRouterState({
    select: (state) => state.location.state.ticketTitle
  })
  if (stepped?.urlId === id) {
    return (
      <TicketCrumbText id={stepped.id} title={stepped.title} animate={false} />
    )
  }
  return (
    <TicketCrumbText
      id={id}
      title={
        Result.isSuccess(result)
          ? result.value.title
          : Result.isInitial(result)
            ? (titleHint ?? null)
            : null
      }
      animate
    />
  )
}

// The ticket is always the last crumb: the page, so it never links.
function TicketCrumbText({
  id,
  title,
  animate
}: Readonly<{ id: TicketId; title: string | null; animate: boolean }>) {
  return (
    <BreadcrumbItem
      prefix={id}
      label={title}
      animate={animate}
      loadingWidth="16ch"
      loadingLabel={m.nav_crumb_loading({ slug: id })}
    />
  )
}

type TicketCrumbData = Data.TaggedEnum.Value<Crumb, "ticket">
type TicketDetailResult = Atom.Type<ReturnType<typeof ticketDetail>>

const noTicket: Atom.Atom<TicketDetailResult> = Atom.make(Result.initial())

// The parent of a sub-ticket opened from it, when the trail should show it.
// Decided here rather than inside a crumb, so the parent's level in the trail
// only exists while it's shown and comes and goes with its animation.
function useTrailParent(ticket: TicketCrumbData | null) {
  const search = useSearch({ strict: false })
  const stepped = useAtomValue(steppedTicket)
  const shownId =
    ticket === null
      ? null
      : stepped?.urlId === ticket.id
        ? stepped.id
        : ticket.id
  const result = useAtomValue(
    ticket === null || shownId === null
      ? noTicket
      : ticketDetail(ticketRequest(ticket.orgSlug, ticket.slug, shownId))
  )
  const parent = Result.isSuccess(result) ? result.value.parent : null
  if (
    parent === null ||
    search.from !== "parent" ||
    search.parentId !== parent.id
  ) {
    return null
  }
  return parent
}

// A sub-ticket's parent shows only its key; the title is a tooltip.
function ParentCrumb({
  orgSlug,
  slug,
  parent
}: Readonly<{
  orgSlug: string
  slug: string
  parent: NonNullable<ReturnType<typeof useTrailParent>>
}>) {
  return (
    <BreadcrumbItem
      prefix={parent.id}
      detail={parent.title}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug, id: parent.id }}
          activeOptions={{ exact: true }}
        />
      }
    />
  )
}
