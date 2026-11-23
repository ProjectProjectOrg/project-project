import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { Button } from "@pp/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { FolderPlus, Plus } from "@pp/ui/icons"
import { getRouteApi, Link } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import { PageContainer, PageHeader } from "@/components/shell/Page"
import { ReadFailure } from "@/components/shell/ReadFailure"
import { me } from "@/features/auth/atoms/auth"
import { DashboardGitSync } from "@/features/dashboard/components/DashboardGitSync"
import {
  MyTicketsSection,
  RecentTicketsSection,
  type MyTicketsView
} from "@/features/dashboard/components/DashboardSections"
import {
  RecentProjects,
  RecentProjectsHeading
} from "@/features/dashboard/components/RecentProjects"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { TicketSelectionProvider } from "@/features/tickets/components/ticket-list/TicketSelection"
import { useOrgActor } from "@/hooks/useActor"
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
  const refreshList = useAtomRefresh(projectsFor(projectsRequest(orgSlug)))
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
          <AsyncView
            result={list}
            onFailure={(failure) => (
              <section className="flex flex-col gap-3">
                <RecentProjectsHeading orgSlug={orgSlug} />
                <ReadFailure failure={failure} onRetry={refreshList} />
              </section>
            )}
            onInitial={() => <TilesSkeleton />}
            onSuccess={({ value }) =>
              value.length === 0 ? (
                createCta
              ) : (
                <RecentProjects
                  orgSlug={orgSlug}
                  projects={value}
                  canCreate={canCreate}
                />
              )
            }
          />
          <TicketSelectionProvider resetKey={`${orgSlug}:${view}`}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 @5xl/dashboard:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @5xl/dashboard:items-start @5xl/dashboard:gap-12">
              <MyTicketsSection
                orgSlug={orgSlug}
                view={view}
                onViewChange={setView}
              />
              <RecentTicketsSection orgSlug={orgSlug} />
            </div>
          </TicketSelectionProvider>
        </div>
      </div>
      <DashboardGitSync orgSlug={orgSlug} />
    </PageContainer>
  )
}

function greet() {
  const h = DateTime.toDate(DateTime.nowUnsafe()).getHours()
  if (h < 5) return m.org_dashboard_greeting_late()
  if (h < 12) return m.org_dashboard_greeting_morning()
  if (h < 18) return m.org_dashboard_greeting_afternoon()
  return m.org_dashboard_greeting_evening()
}

// The dashboard of an organisation with no projects: the whole screen is the
// invitation, so the dither is at its strongest and drifts.
function NewProjectCTA({ orgSlug }: { orgSlug: string }) {
  return (
    <Empty intensity="strong">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderPlus strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.org_dashboard_first_project_cta_title()}</EmptyTitle>
        <EmptyDescription>
          {m.org_dashboard_first_project_cta_body()}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          size="sm"
          leadingIcon={Plus}
          render={<Link to="/orgs/$orgSlug/projects" params={{ orgSlug }} />}
        >
          {m.org_dashboard_first_project_cta_action()}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function TilesSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <div className="h-6 w-40 skeleton rounded-md bg-muted/60" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-32 skeleton rounded-xl border border-border surface-background"
          />
        ))}
      </div>
    </section>
  )
}
