import { useAtomValue } from "@effect/atom-react"
import { getRouteApi, Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { FolderKanban } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"

import { PageContainer, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectRow } from "@/features/projects/components/ProjectRow"
import { CreateProjectRow } from "@/features/projects/forms/create-project"
import { useOrgActor } from "@/lib/access"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/projects/")

export function Projects() {
  const { orgSlug } = routeApi.useParams()
  const list = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const org = useOrgActor(orgSlug)
  const canCreate = org.call("projects", "create")
  const canMigrate = org.call("jiraMigrations", "create")
  const [creating, setCreating] = useState(false)

  const content = Result.matchWithError(list, {
    onInitial: () => <ListSkeleton />,
    onError: (error) => (
      <>
        <CreateProjectRow
          orgSlug={orgSlug}
          canCreate={canCreate}
          onFocusChange={setCreating}
        />
        <ListMessage>
          {m.projects_list_load_error({ tag: error._tag })}
        </ListMessage>
      </>
    ),
    onDefect: (defect) => (
      <>
        <CreateProjectRow
          orgSlug={orgSlug}
          canCreate={canCreate}
          onFocusChange={setCreating}
        />
        <ListMessage>
          {m.projects_list_defect({ defect: String(defect) })}
        </ListMessage>
      </>
    ),
    onSuccess: ({ value }) => (
      <>
        <CreateProjectRow
          orgSlug={orgSlug}
          canCreate={canCreate}
          onFocusChange={setCreating}
        />
        <motion.div
          animate={{ opacity: creating ? 0.35 : 1 }}
          transition={transitions.presence}
        >
          {value.length === 0 ? (
            <EmptyProjects canCreate={canCreate} />
          ) : (
            <ul className="flex flex-col gap-2">
              {value.map((project) => (
                <li key={project.slug}>
                  <ProjectRow orgSlug={orgSlug} project={project} />
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </>
    )
  })

  return (
    <PageContainer className="gap-3">
      <div className="flex items-end justify-between gap-4">
        <PageHeader>
          <h1>{m.projects_page_title()}</h1>
          <p>
            {canCreate
              ? m.projects_page_subtitle()
              : m.projects_page_subtitle_invited()}
          </p>
        </PageHeader>
        {canMigrate && (
          <Button
            variant="tertiary"
            size="sm"
            className="shrink-0"
            render={
              <Link to="/orgs/$orgSlug/migrations/jira" params={{ orgSlug }} />
            }
          >
            {m.jira_migration_projects_entry()}
          </Button>
        )}
      </div>

      {content}
    </PageContainer>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="skeleton h-[60px] rounded-lg border border-border bg-card"
        />
      ))}
    </div>
  )
}

function ListMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function EmptyProjects({ canCreate }: Readonly<{ canCreate: boolean }>) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <div className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
        <FolderKanban className="size-5" strokeWidth={1.75} />
      </div>
      <div className="text-sm font-medium">{m.projects_list_empty()}</div>
      <p className="max-w-xs text-xs text-muted-foreground">
        {canCreate
          ? m.projects_list_empty_body()
          : m.projects_list_empty_body_invited()}
      </p>
    </div>
  )
}
