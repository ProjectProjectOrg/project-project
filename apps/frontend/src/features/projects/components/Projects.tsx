import { useAtomValue } from "@effect/atom-react"
import { Button } from "@pp/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { FolderKanban } from "@pp/ui/icons"
import { transitions } from "@pp/ui/lib/springs"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import { getRouteApi, Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { motion } from "motion/react"
import { useState } from "react"

import { PageContainer, PageHeader } from "@/components/shell/Page"
import { ActiveImports } from "@/features/jira/components/ActiveImports"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectRow } from "@/features/projects/components/ProjectRow"
import { CreateProjectRow } from "@/features/projects/forms/create-project"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/projects/")

export function Projects() {
  const { orgSlug } = routeApi.useParams()
  const list = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const org = useOrgActor(orgSlug)
  const canCreate = org.call("projects", "create")
  const canMigrate = org.call("jiraMigrations", "create")
  const canImport = org.call("projectImports", "upload")
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
          {canMigrate ? <ActiveImports orgSlug={orgSlug} /> : null}
        </PageHeader>
        {(canImport || canMigrate) && (
          <div className="flex shrink-0 items-center gap-2">
            {canImport && (
              <Button
                variant="tertiary"
                size="sm"
                render={
                  <Link
                    to="/orgs/$orgSlug/imports/projectproject"
                    params={{ orgSlug }}
                  />
                }
              >
                {m.project_import_projects_entry()}
              </Button>
            )}
            {canMigrate && (
              <Button
                variant="tertiary"
                size="sm"
                render={
                  <Link
                    to="/orgs/$orgSlug/migrations/jira"
                    params={{ orgSlug }}
                  />
                }
              >
                {m.jira_import_projects_entry()}
              </Button>
            )}
          </div>
        )}
      </div>

      <HotkeysProvider scope="projects">{content}</HotkeysProvider>
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
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-body text-muted-foreground">
      {children}
    </div>
  )
}

function EmptyProjects({ canCreate }: Readonly<{ canCreate: boolean }>) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderKanban strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.projects_list_empty()}</EmptyTitle>
        <EmptyDescription>
          {canCreate
            ? m.projects_list_empty_body()
            : m.projects_list_empty_body_invited()}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
