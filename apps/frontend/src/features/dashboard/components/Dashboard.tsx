import { useAtomValue } from "@effect/atom-react"
import { getRouteApi, Link } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import { Plus } from "lucide-react"

import { PageContainer, PageHeader } from "@/components/shell/Page"
import { me } from "@/features/auth/atoms/auth"
import { DashboardGitSync } from "@/features/dashboard/components/DashboardGitSync"
import {
  MyTicketsSection,
  RecentTicketsSection,
  type MyTicketsView
} from "@/features/dashboard/components/DashboardSections"
import { RecentProjects } from "@/features/dashboard/components/RecentProjects"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { useOrgActor } from "@/lib/access"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/")

export function Dashboard() {
  const { orgSlug } = routeApi.useParams()
  const { view = "board" } = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const setView = (next: MyTicketsView) => {
    void navigate({ search: (prev) => ({ ...prev, view: next }) })
  }
  const viewer = useAtomValue(me())
  const list = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const canCreate = useOrgActor(orgSlug).call("projects", "create")
  const createCta = canCreate ? <NewProjectCTA orgSlug={orgSlug} /> : null
  const name = Result.isSuccess(viewer)
    ? viewer.value.name.split(" ")[0]
    : m.org_dashboard_greeting_fallback_name()
  const greeting = greet()

  return (
    <PageContainer>
      <PageHeader>
        <h1>{m.org_dashboard_greeting_line({ greeting, name })}</h1>
        <p>{m.org_dashboard_subtitle()}</p>
      </PageHeader>

      <div className="@container/dashboard">
        <div className="flex flex-col gap-6 @5xl/dashboard:gap-12">
          {Result.matchWithError(list, {
            onInitial: () => <TilesSkeleton />,
            onError: () => createCta,
            onDefect: () => createCta,
            onSuccess: ({ value }) =>
              value.length === 0 ? (
                createCta
              ) : (
                <RecentProjects
                  orgSlug={orgSlug}
                  projects={value}
                  canCreate={canCreate}
                />
              )
          })}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 @5xl/dashboard:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @5xl/dashboard:items-start @5xl/dashboard:gap-12">
            <MyTicketsSection
              orgSlug={orgSlug}
              view={view}
              onViewChange={setView}
            />
            <RecentTicketsSection orgSlug={orgSlug} />
          </div>
        </div>
      </div>
      <DashboardGitSync orgSlug={orgSlug} />
    </PageContainer>
  )
}

function greet(): string {
  const h = DateTime.toDate(DateTime.nowUnsafe()).getHours()
  if (h < 5) return m.org_dashboard_greeting_late()
  if (h < 12) return m.org_dashboard_greeting_morning()
  if (h < 18) return m.org_dashboard_greeting_afternoon()
  return m.org_dashboard_greeting_evening()
}

function NewProjectCTA({ orgSlug }: { orgSlug: string }) {
  return (
    <Link
      to="/orgs/$orgSlug/projects"
      params={{ orgSlug }}
      className={cn(
        "group flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-background/50 px-6 py-12 text-center transition-colors",
        "hover:border-border hover:bg-hover"
      )}
    >
      <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
        <Plus className="size-5" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-sm font-medium">
          {m.org_dashboard_first_project_cta_title()}
        </div>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {m.org_dashboard_first_project_cta_body()}
        </p>
      </div>
    </Link>
  )
}

function TilesSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <div className="skeleton h-6 w-40 rounded-md bg-muted/60" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="skeleton h-32 rounded-xl border border-border bg-background"
          />
        ))}
      </div>
    </section>
  )
}
