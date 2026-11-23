import { BreadcrumbItem, Breadcrumbs } from "@pp/ui/breadcrumbs"
import { Button } from "@pp/ui/button"
import { useEffect, useState, type ComponentProps } from "react"

const PROJECTS = ["Atlas Mobile App", "Billing Platform", "Marketing Site"]

const TICKETS = [
  ["ATL-10", "Skip onboarding for invited users"],
  ["ATL-11", "Offline sync for job checklists"],
  ["ATL-22", "Accessibility audit of checklist screens"]
] as const

const PARENT = ["ATL-3", "Sync conflict resolution"] as const

type State = Readonly<{
  dashboard: boolean
  project: number
  loading: boolean
  sprint: boolean
  ticket: number | null
  parent: boolean
  about: boolean
}>

const INITIAL: State = {
  dashboard: false,
  project: 0,
  loading: false,
  sprint: false,
  ticket: 0,
  parent: false,
  about: false
}

// The demo's links are buttons, so clicking one doesn't leave the page.
const link = (props: ComponentProps<"button">) => (
  <button type="button" {...props} />
)

// Every change the app's trail goes through, one button each. Keys are what
// the app uses: Projects and Dashboard are different crumbs, while the
// project, sprint, parent and ticket crumbs are keyed by role, so a new
// project or ticket keeps its crumb and rolls the new name in.
export default function Playground() {
  const [state, setState] = useState(INITIAL)
  const set = (patch: Partial<State>) => setState({ ...state, ...patch })
  useEffect(() => {
    if (!state.loading) return undefined
    const timer = window.setTimeout(
      () => setState((current) => ({ ...current, loading: false })),
      900
    )
    return () => window.clearTimeout(timer)
  }, [state.loading])

  const ticket = state.ticket === null ? null : TICKETS[state.ticket]
  return (
    <div className="grid w-full gap-6">
      <div className="flex h-12 min-w-0 items-center rounded-xl surface-page px-4">
        <Breadcrumbs label="Breadcrumb">
          <BreadcrumbItem
            key={state.dashboard ? "dashboard" : "projects"}
            label={state.dashboard ? "Dashboard" : "Projects"}
            render={link}
          />
          {state.dashboard ? null : (
            <BreadcrumbItem
              key="project"
              label={state.loading ? null : (PROJECTS[state.project] ?? "")}
              loadingWidth="14ch"
              loadingLabel="Loading project"
              render={link}
            />
          )}
          {!state.dashboard && state.about ? (
            <BreadcrumbItem key="about" label="About" />
          ) : null}
          {!state.dashboard && !state.about && state.sprint ? (
            <BreadcrumbItem key="sprint" label="Sprint 24" render={link} />
          ) : null}
          {!state.dashboard &&
          !state.about &&
          ticket !== null &&
          state.parent ? (
            <BreadcrumbItem
              key="parent"
              prefix={PARENT[0]}
              detail={PARENT[1]}
              render={link}
            />
          ) : null}
          {state.dashboard || state.about || ticket === null ? null : (
            <BreadcrumbItem key="ticket" prefix={ticket[0]} label={ticket[1]} />
          )}
        </Breadcrumbs>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() =>
            set({
              dashboard: false,
              project: (state.project + 1) % PROJECTS.length
            })
          }
        >
          Next project
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() =>
            set({
              ticket:
                state.ticket === null ? 0 : (state.ticket + 1) % TICKETS.length
            })
          }
        >
          Next ticket
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => set({ ticket: state.ticket === null ? 0 : null })}
        >
          {state.ticket === null ? "Open ticket" : "Close ticket"}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => set({ sprint: !state.sprint })}
        >
          {state.sprint ? "Leave sprint" : "Open sprint"}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => set({ parent: !state.parent })}
        >
          {state.parent ? "Hide parent" : "From parent"}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => set({ about: !state.about })}
        >
          {state.about ? "Back to ticket" : "About page"}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => set({ loading: true })}
        >
          Reload project
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => set({ dashboard: !state.dashboard })}
        >
          {state.dashboard ? "Back to project" : "Dashboard"}
        </Button>
      </div>
    </div>
  )
}
