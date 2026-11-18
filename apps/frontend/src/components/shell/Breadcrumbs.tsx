import { useAtomValue } from "@effect/atom-react"
import type { GroupId, TicketId } from "@pp/shared"
import { BreadcrumbItem, Breadcrumbs as Trail } from "@pp/ui/breadcrumbs"
import { Link, useMatches, useSearch } from "@tanstack/react-router"
import * as Data from "effect/Data"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

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

export type Crumb = Data.TaggedEnum<{
  static: Readonly<{
    label: string
    to?: string
    params?: Record<string, string>
  }>
  project: Readonly<{ orgSlug: string; slug: string }>
  ticket: Readonly<{
    orgSlug: string
    slug: string
    id: TicketId
  }>
  sprint: Readonly<{
    orgSlug: string
    slug: string
    groupId: GroupId
  }>
}>
export const Crumb = Data.taggedEnum<Crumb>()

export type CrumbData = Crumb | ReadonlyArray<Crumb>

function flatten(crumbs: ReadonlyArray<CrumbData | undefined>) {
  return crumbs.flatMap((crumb) =>
    crumb === undefined ? [] : "_tag" in crumb ? [crumb] : crumb
  )
}

// A crumb's key is its identity in the trail. Static crumbs (section and
// page titles: Settings, General, Integrations) are their depth, so moving
// between sibling pages keeps the crumb and rolls the new title in. The
// project, sprint and ticket crumbs are their role, so moving to another
// project or stepping to the next ticket does the same, while a ticket that
// takes a page's place is a new crumb.
const crumbKey = (crumb: Crumb, depth: number) =>
  Crumb.$is("static")(crumb) ? `static-${depth}` : crumb._tag

export function Breadcrumbs({ className }: { className?: string }) {
  const matches = useMatches()
  const raw = matches.map(({ loaderData }) =>
    loaderData && "crumb" in loaderData ? loaderData.crumb : undefined
  )
  const crumbs = flatten(raw)
  const last = crumbs.at(-1)
  const lastTicket =
    last !== undefined && Crumb.$is("ticket")(last) ? last : null
  const parent = useTrailParent(lastTicket)
  if (crumbs.length === 0) return null
  return (
    <Trail label={m.nav_breadcrumb_label()} className={className}>
      {crumbs.slice(0, -1).map((crumb, depth) => (
        <CrumbItem key={crumbKey(crumb, depth)} crumb={crumb} />
      ))}
      {parent === null || lastTicket === null ? null : (
        <ParentCrumb
          key="parent"
          orgSlug={lastTicket.orgSlug}
          slug={lastTicket.slug}
          parent={parent}
        />
      )}
      {last ? (
        <CrumbItem key={crumbKey(last, crumbs.length - 1)} crumb={last} />
      ) : null}
    </Trail>
  )
}

function CrumbItem({ crumb }: Readonly<{ crumb: Crumb }>) {
  return Crumb.$match(crumb, {
    static: ({ label, to, params }) => (
      <BreadcrumbItem
        label={label}
        render={
          to === undefined ? undefined : (
            <Link to={to} params={params} activeOptions={{ exact: true }} />
          )
        }
      />
    ),
    project: ({ orgSlug, slug }) => (
      <ProjectCrumb orgSlug={orgSlug} slug={slug} />
    ),
    ticket: ({ orgSlug, slug, id }) => (
      <TicketCrumb orgSlug={orgSlug} slug={slug} id={id} />
    ),
    sprint: ({ orgSlug, slug, groupId }) => (
      <SprintCrumb orgSlug={orgSlug} slug={slug} groupId={groupId} />
    )
  })
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

function ProjectCrumb({
  orgSlug,
  slug
}: Readonly<{ orgSlug: string; slug: string }>) {
  const result = useAtomValue(project(projectRequest(orgSlug, slug)))
  return (
    <BreadcrumbItem
      label={Result.isSuccess(result) ? result.value.name : null}
      loadingWidth={`${Math.max(slug.length, 4)}ch`}
      loadingLabel={m.nav_crumb_loading({ slug })}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug"
          params={{ orgSlug, slug }}
          activeOptions={{ exact: true }}
        />
      }
    />
  )
}

function TicketCrumb({
  orgSlug,
  slug,
  id
}: Readonly<{ orgSlug: string; slug: string; id: TicketId }>) {
  const stepped = useAtomValue(steppedTicket)
  if (stepped?.urlId === id) {
    return <TicketCrumbText id={stepped.id} title={stepped.title} />
  }
  return <LoadedTicketCrumb orgSlug={orgSlug} slug={slug} id={id} />
}

function LoadedTicketCrumb({
  orgSlug,
  slug,
  id
}: Readonly<{ orgSlug: string; slug: string; id: TicketId }>) {
  const result = useAtomValue(ticketDetail(ticketRequest(orgSlug, slug, id)))
  return (
    <TicketCrumbText
      id={id}
      title={Result.isSuccess(result) ? result.value.title : null}
    />
  )
}

// The ticket is always the last crumb: the page, so it never links.
function TicketCrumbText({
  id,
  title
}: Readonly<{ id: TicketId; title: string | null }>) {
  return (
    <BreadcrumbItem
      prefix={id}
      label={title}
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
