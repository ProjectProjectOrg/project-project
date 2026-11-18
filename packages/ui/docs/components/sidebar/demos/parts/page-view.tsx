import { ChevronRight } from "@pp/ui/icons"
import type { ReactNode } from "react"

import {
  findSprint,
  findTicket,
  PROJECTS,
  SETTINGS,
  SPRINTS,
  TICKETS,
  type Route
} from "../data"
import { PriorityIcon, SprintIcon, StatusIcon } from "./marks"
import { MonetStrip } from "./monet-banner"

// A stand-in for the app's pages, built like them: features/tickets/
// components/ticket-list/Row.tsx for rows, components/shell/Page.tsx for the
// header (display type, bold).
function PageBody({
  scope,
  route,
  go
}: Readonly<{
  scope: string
  route: Route
  go: (route: Route) => void
}>) {
  const project = PROJECTS.find((p) => p.slug === scope)
  if (project === undefined) {
    const title = route.page === "projects" ? "All projects" : "Dashboard"
    return (
      <>
        <Crumbs parts={[title]} />
        <Header
          title={title}
          description="Your pinned tickets and sprints from every project are in the sidebar."
        />
      </>
    )
  }
  const ticket =
    route.page === "ticket" && route.id ? findTicket(route.id) : undefined
  const sprint =
    route.page === "sprint" && route.id ? findSprint(route.id) : undefined
  const tickets = TICKETS.get(project.slug) ?? []

  if (route.page === "settings") {
    const section = SETTINGS.find(([id]) => id === route.id) ?? SETTINGS[0]
    return (
      <>
        <Crumbs parts={[project.name, "Settings"]} />
        <Header
          title={section[1]}
          description={`${section[1]} for ${project.name}.`}
        />
      </>
    )
  }
  if (ticket)
    return (
      <>
        <Crumbs parts={[project.name, "Backlog", ticket[0]]} />
        <h1 className="text-display font-bold text-foreground">{ticket[1]}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-body text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <StatusIcon status={ticket[2]} />
            {statusLabel[ticket[2]]}
          </span>
          <span className="flex items-center gap-1.5">
            <PriorityIcon priority={ticket[3]} />
            {priorityLabel[ticket[3]]}
          </span>
        </div>
        <p className="mt-6 max-w-[56ch] text-body text-muted-foreground">
          Open another ticket from the backlog and the outlined row under Pinned
          follows you. Press its pin to keep it.
        </p>
      </>
    )
  if (route.page === "sprints")
    return (
      <>
        <Crumbs parts={[project.name, "Sprints"]} />
        <Header title="Sprints" />
        <List>
          {SPRINTS.map(([id, name, when, state]) => (
            <ListButton key={id} onClick={() => go({ page: "sprint", id })}>
              <SprintIcon state={state} />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="text-caption text-muted-foreground">{when}</span>
            </ListButton>
          ))}
        </List>
      </>
    )
  if (route.page === "about")
    return (
      <>
        <Crumbs parts={[project.name, "About"]} />
        <Header
          title={project.name}
          description="The iOS and Android app for field teams."
        />
      </>
    )
  return (
    <>
      <Crumbs parts={[project.name, sprint ? "Sprints" : "Backlog"]} />
      {sprint ? (
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-display font-bold text-foreground">
            <SprintIcon state={sprint[3]} className="size-5" />
            {sprint[1]}
          </h1>
          <p className="text-body text-muted-foreground">{sprint[2]}</p>
        </div>
      ) : (
        <Header title="Backlog" />
      )}
      <List>
        {tickets.map(([id, title, status, priority]) => (
          <ListButton key={id} onClick={() => go({ page: "ticket", id })}>
            <StatusIcon status={status} />
            <PriorityIcon priority={priority} />
            <span className="min-w-[4.5em] text-caption text-muted-foreground tabular-nums">
              {id}
            </span>
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </ListButton>
        ))}
      </List>
    </>
  )
}

export function PageView(
  props: Readonly<{
    scope: string
    route: Route
    go: (route: Route) => void
  }>
) {
  const project = PROJECTS.find((p) => p.slug === props.scope)
  const settings = props.route.page === "settings"
  return (
    // Like the app's pages, it swaps at once: only the sidebar animates.
    <div className="relative isolate">
      {project?.banner && !settings ? (
        // The app's project pages draw the banner behind the header, 160px
        // tall and bleeding to the card's edges.
        <MonetStrip
          banner={project.banner}
          className="absolute -inset-x-6 -top-3 -z-10 h-40"
        />
      ) : null}
      <PageBody {...props} />
    </div>
  )
}

const statusLabel = {
  todo: "Todo",
  progress: "In progress",
  review: "In review",
  done: "Done"
} as const

const priorityLabel = { low: "Low", med: "Med", high: "High" } as const

function Crumbs({ parts }: Readonly<{ parts: ReadonlyArray<string> }>) {
  return (
    <div className="mb-3 flex min-h-8 items-center gap-1 text-body text-muted-foreground">
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-1">
          {index > 0 ? <ChevronRight className="size-3.5" /> : null}
          <span className={index === parts.length - 1 ? "text-foreground" : ""}>
            {part}
          </span>
        </span>
      ))}
    </div>
  )
}

function Header({
  title,
  description
}: Readonly<{ title: string; description?: string }>) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-display font-bold text-foreground">{title}</h1>
      {description ? (
        <p className="text-body text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

function List({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="-mx-3 mt-5 flex flex-col">{children}</div>
}

function ListButton({
  onClick,
  children
}: Readonly<{ onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-body text-foreground transition-colors hover:bg-hover"
    >
      {children}
    </button>
  )
}
