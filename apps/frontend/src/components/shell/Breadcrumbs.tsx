import { useAtomValue } from "@effect/atom-react"
import type { GroupId, TicketId } from "@pp/shared"
import { Link, useMatches, useSearch } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronRight } from "lucide-react"
import { createContext, use, useMemo, useRef, type ReactNode } from "react"

import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
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
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/useFluidHover"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type Crumb =
  | {
      type: "static"
      label: string
      to?: string
      params?: Record<string, string>
    }
  | { type: "project"; orgSlug: string; slug: string }
  | { type: "ticket"; orgSlug: string; slug: string; id: TicketId }
  | { type: "sprint"; orgSlug: string; slug: string; groupId: GroupId }

export type CrumbData = Crumb | ReadonlyArray<Crumb>

function flatten(
  crumbs: ReadonlyArray<CrumbData | undefined>
): ReadonlyArray<Crumb> {
  return crumbs.flatMap((crumb) =>
    crumb === undefined ? [] : "type" in crumb ? [crumb] : crumb
  )
}

export function Breadcrumbs({ className }: { className?: string }) {
  const matches = useMatches()
  const raw = matches.map(({ loaderData }) =>
    loaderData && "crumb" in loaderData ? loaderData.crumb : undefined
  )
  const crumbs = flatten(raw)
  const trailRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(trailRef, { axis: "x" })

  if (crumbs.length === 0) return null
  const crumb = (c: Crumb, i: number) => (
    <CrumbSlot key={crumbKey(c, i)} index={i} isLast={i === crumbs.length - 1}>
      <CrumbItem crumb={c} />
    </CrumbSlot>
  )
  const current = crumbs.length - 1
  const last = crumbs[current]

  return (
    <nav
      aria-label={m.nav_breadcrumb_label()}
      className={cn(
        "-ml-2 flex min-w-0 items-center text-body text-muted-foreground",
        className
      )}
    >
      <div
        ref={trailRef}
        role="presentation"
        onMouseEnter={hover.handlers.onMouseEnter}
        onMouseMove={hover.handlers.onMouseMove}
        onMouseLeave={hover.handlers.onMouseLeave}
        onClick={hover.handlers.onClick}
        className="relative flex shrink-0 items-center"
      >
        <FluidHoverHighlight hover={hover} className="rounded-md" />
        <TrailContext value={hover.registerItem}>
          {crumbs.slice(0, current).map(crumb)}
          {last?.type === "ticket" && (
            <CrumbSlot index={current} isLast={false}>
              <TicketTrailCrumb
                orgSlug={last.orgSlug}
                slug={last.slug}
                id={last.id}
              />
            </CrumbSlot>
          )}
        </TrailContext>
      </div>
      {last && crumb(last, current)}
    </nav>
  )
}

const TrailContext = createContext<
  ((index: number, element: HTMLElement | null) => void) | undefined
>(undefined)

const CrumbPosition = createContext<
  Readonly<{ index: number; isLast: boolean }>
>({ index: 0, isLast: true })

function CrumbSlot({
  index,
  isLast,
  children
}: Readonly<{ index: number; isLast: boolean; children: ReactNode }>) {
  const value = useMemo(() => ({ index, isLast }), [index, isLast])
  return <CrumbPosition value={value}>{children}</CrumbPosition>
}

function CrumbSeparator() {
  return (
    <ChevronRight
      className="size-3.5 shrink-0 text-muted-foreground"
      strokeWidth={1.75}
      aria-hidden
    />
  )
}

function CrumbSkeleton({
  width,
  label
}: Readonly<{ width: string; label: string }>) {
  const { isLast } = use(CrumbPosition)
  return (
    <span className="flex shrink-0 items-center gap-1 pr-1.5 pl-2">
      <span
        className="skeleton inline-block h-4 rounded bg-muted/60"
        style={{ width }}
        aria-label={label}
      />
      {!isLast && <CrumbSeparator />}
    </span>
  )
}

function crumbKey(c: Crumb, i: number) {
  if (c.type === "static") return `s-${i}-${c.label}`
  if (c.type === "project") return `p-${c.orgSlug}-${c.slug}`
  if (c.type === "sprint") return `g-${c.orgSlug}-${c.slug}-${c.groupId}`
  return `t-${c.orgSlug}-${c.slug}-${c.id}`
}

function CrumbItem({ crumb }: Readonly<{ crumb: Crumb }>) {
  switch (crumb.type) {
    case "static":
      return (
        <CrumbText to={crumb.to} params={crumb.params}>
          <span className="truncate">{crumb.label}</span>
        </CrumbText>
      )
    case "project":
      return <ProjectCrumb orgSlug={crumb.orgSlug} slug={crumb.slug} />
    case "ticket":
      return (
        <TicketCrumb orgSlug={crumb.orgSlug} slug={crumb.slug} id={crumb.id} />
      )
    case "sprint":
      return (
        <SprintCrumb
          orgSlug={crumb.orgSlug}
          slug={crumb.slug}
          groupId={crumb.groupId}
        />
      )
  }
}

function SprintCrumb({
  orgSlug,
  slug,
  groupId
}: Readonly<{ orgSlug: string; slug: string; groupId: GroupId }>) {
  const req = sprintRequest(orgSlug, slug, groupId)
  const result = useAtomValue(sprintDetail(req))
  if (!Result.isSuccess(result)) {
    return (
      <CrumbSkeleton
        width={`${Math.max(groupId.length, 4)}ch`}
        label={m.nav_crumb_loading({ slug: groupId })}
      />
    )
  }
  return (
    <CrumbText
      to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
      params={{ orgSlug, slug, groupId }}
    >
      <span className="truncate">{result.value.name}</span>
    </CrumbText>
  )
}

function ProjectCrumb({
  orgSlug,
  slug
}: Readonly<{ orgSlug: string; slug: string }>) {
  const result = useAtomValue(project(projectRequest(orgSlug, slug)))
  if (!Result.isSuccess(result)) {
    return (
      <CrumbSkeleton
        width={`${Math.max(slug.length, 4)}ch`}
        label={m.nav_crumb_loading({ slug })}
      />
    )
  }
  return (
    <CrumbText to="/orgs/$orgSlug/projects/$slug" params={{ orgSlug, slug }}>
      <span className="truncate">{result.value.name}</span>
    </CrumbText>
  )
}

function TicketCrumb({
  orgSlug,
  slug,
  id
}: Readonly<{ orgSlug: string; slug: string; id: TicketId }>) {
  const stepped = useAtomValue(steppedTicket)
  if (stepped?.urlId === id) {
    return (
      <TicketCrumbText
        orgSlug={orgSlug}
        slug={slug}
        id={stepped.id}
        title={stepped.title}
      />
    )
  }
  return <LoadedTicketCrumb orgSlug={orgSlug} slug={slug} id={id} />
}

function LoadedTicketCrumb({
  orgSlug,
  slug,
  id
}: Readonly<{ orgSlug: string; slug: string; id: TicketId }>) {
  const req = ticketRequest(orgSlug, slug, id)
  const result = useAtomValue(ticketDetail(req))
  return (
    <TicketCrumbText
      orgSlug={orgSlug}
      slug={slug}
      id={id}
      title={Result.isSuccess(result) ? result.value.title : null}
    />
  )
}

function TicketCrumbText({
  orgSlug,
  slug,
  id,
  title
}: Readonly<{
  orgSlug: string
  slug: string
  id: TicketId
  title: string | null
}>) {
  return (
    <CrumbText to="/orgs/$orgSlug/projects/$slug" params={{ orgSlug, slug }}>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-caption/[var(--lh-body)] text-muted-foreground tabular-nums">
          {id}
        </span>
        <span className={cn("truncate", title === null && "italic opacity-60")}>
          {title ?? m.nav_crumb_loading_placeholder()}
        </span>
      </span>
    </CrumbText>
  )
}

function TicketTrailCrumb({
  orgSlug,
  slug,
  id
}: Readonly<{ orgSlug: string; slug: string; id: TicketId }>) {
  const search = useSearch({ strict: false })
  const stepped = useAtomValue(steppedTicket)
  const shownId = stepped?.urlId === id ? stepped.id : id
  const result = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, slug, shownId))
  )
  if (search.from === "sprintBoard" && search.sprint !== undefined) {
    return <SprintCrumb orgSlug={orgSlug} slug={slug} groupId={search.sprint} />
  }
  const parent = Result.isSuccess(result) ? result.value.parent : null
  if (
    parent === null ||
    search.from !== "parent" ||
    search.parentId !== parent.id
  ) {
    return null
  }
  return (
    <CrumbText
      to="/orgs/$orgSlug/projects/$slug/tickets/$id"
      params={{ orgSlug, slug, id: parent.id }}
    >
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-caption/[var(--lh-body)] tabular-nums">
          {parent.id}
        </span>
        <span className="truncate">{parent.title}</span>
      </span>
    </CrumbText>
  )
}

function CrumbText({
  to,
  params,
  children
}: Readonly<{
  to?: string
  params?: Record<string, string>
  children: ReactNode
}>) {
  const { index, isLast } = use(CrumbPosition)
  const register = use(TrailContext)
  const ref = useRef<HTMLAnchorElement>(null)
  const linked = !isLast && to !== undefined
  useRegisterFluidHoverItem(linked ? register : undefined, index, ref)
  const className = cn(
    "relative z-10 flex h-7 items-center gap-1.5 rounded-md pl-2",
    isLast
      ? "max-w-1/2 min-w-0 pr-2 text-foreground"
      : "max-w-[24ch] shrink-0 pr-1.5"
  )
  const content = (
    <>
      {children}
      {!isLast && <CrumbSeparator />}
    </>
  )
  if (!linked) {
    return (
      <span aria-current={isLast ? "page" : undefined} className={className}>
        {content}
      </span>
    )
  }
  return (
    <Link
      ref={ref}
      to={to}
      params={params}
      activeOptions={{ exact: true }}
      className={cn(className, "transition-colors hover:text-foreground")}
    >
      {content}
    </Link>
  )
}
