import { useState } from "react"
import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import type {
  JiraConnection,
  JiraProjectChoice,
  JiraSite
} from "@projectproject/shared"
import {
  jiraProfileAtom,
  jiraProjectsAtom,
  jiraSitesAtom
} from "@/atoms/jiraMigration"
import { ErrorPage } from "@/components/ErrorPage"
import { m } from "@/paraglide/messages"
import { JiraMigrationShell } from "./JiraMigrationShell"
import { JiraSourceStep } from "./JiraSourceStep"

export function JiraMigrationStartPage({ orgSlug }: { orgSlug: string }) {
  const profile = useAtomValue(jiraProfileAtom)

  return (
    <JiraMigrationShell orgSlug={orgSlug}>
      {Result.matchWithError(profile, {
        onInitial: () => <SourceSkeleton />,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) => (
          <SourceForConnection orgSlug={orgSlug} connection={value} />
        )
      })}
    </JiraMigrationShell>
  )
}

function SourceForConnection({
  orgSlug,
  connection
}: {
  orgSlug: string
  connection: JiraConnection
}) {
  if (connection.status !== "connected") {
    return (
      <JiraSourceStep
        connection={connection}
        sites={[]}
        projects={[]}
        selectedCloudId=""
        selectedProjectId=""
        onCloudIdChange={() => {}}
        onProjectIdChange={() => {}}
        migrationApiAvailable={false}
        oauthReturnPath={`/orgs/${orgSlug}/projects/migrate/jira`}
      />
    )
  }

  return <ConnectedSource orgSlug={orgSlug} connection={connection} />
}

function ConnectedSource({
  orgSlug,
  connection
}: {
  orgSlug: string
  connection: JiraConnection
}) {
  const sitesResult = useAtomValue(jiraSitesAtom)
  const [cloudId, setCloudId] = useState("")
  const [projectId, setProjectId] = useState("")

  return Result.matchWithError(sitesResult, {
    onInitial: () => (
      <SourceView
        orgSlug={orgSlug}
        connection={connection}
        sites={[]}
        projects={[]}
        cloudId={cloudId}
        projectId={projectId}
        setCloudId={setCloudId}
        setProjectId={setProjectId}
        sitesLoading
      />
    ),
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) => (
      <ProjectsSource
        orgSlug={orgSlug}
        connection={connection}
        sites={value}
        cloudId={cloudId}
        projectId={projectId}
        setCloudId={setCloudId}
        setProjectId={setProjectId}
      />
    )
  })
}

function ProjectsSource({
  orgSlug,
  connection,
  sites,
  cloudId,
  projectId,
  setCloudId,
  setProjectId
}: {
  orgSlug: string
  connection: JiraConnection
  sites: ReadonlyArray<JiraSite>
  cloudId: string
  projectId: string
  setCloudId: (value: string) => void
  setProjectId: (value: string) => void
}) {
  const projectsResult = useAtomValue(jiraProjectsAtom(cloudId))

  return Result.matchWithError(projectsResult, {
    onInitial: () => (
      <SourceView
        orgSlug={orgSlug}
        connection={connection}
        sites={sites}
        projects={[]}
        cloudId={cloudId}
        projectId={projectId}
        setCloudId={setCloudId}
        setProjectId={setProjectId}
        projectsLoading={Boolean(cloudId)}
      />
    ),
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) => (
      <SourceView
        orgSlug={orgSlug}
        connection={connection}
        sites={sites}
        projects={value}
        cloudId={cloudId}
        projectId={projectId}
        setCloudId={setCloudId}
        setProjectId={setProjectId}
      />
    )
  })
}

function SourceView({
  orgSlug,
  connection,
  sites,
  projects,
  cloudId,
  projectId,
  setCloudId,
  setProjectId,
  sitesLoading,
  projectsLoading
}: {
  orgSlug: string
  connection: JiraConnection
  sites: ReadonlyArray<JiraSite>
  projects: ReadonlyArray<JiraProjectChoice>
  cloudId: string
  projectId: string
  setCloudId: (value: string) => void
  setProjectId: (value: string) => void
  sitesLoading?: boolean
  projectsLoading?: boolean
}) {
  return (
    <JiraSourceStep
      connection={connection}
      sites={sites}
      projects={projects}
      selectedCloudId={cloudId}
      selectedProjectId={projectId}
      onCloudIdChange={setCloudId}
      onProjectIdChange={setProjectId}
      sitesLoading={sitesLoading}
      projectsLoading={projectsLoading}
      migrationApiAvailable={false}
      oauthReturnPath={`/orgs/${orgSlug}/projects/migrate/jira`}
    />
  )
}

export function JiraMigrationPendingPage({
  orgSlug,
  migrationId
}: {
  orgSlug: string
  migrationId: string
}) {
  return (
    <JiraMigrationShell orgSlug={orgSlug} currentStep="snapshot">
      <div className="flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">
            {m.jira_migration_item_pending_title()}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground text-pretty">
            {m.jira_migration_item_pending_description()}
          </p>
          <p className="mt-5 font-mono text-xs text-muted-foreground">
            {migrationId}
          </p>
        </div>
      </div>
    </JiraMigrationShell>
  )
}

function SourceSkeleton() {
  return (
    <div className="flex min-h-[520px] flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
      <div className="skeleton h-7 w-64 rounded-lg" />
      <div className="skeleton h-4 w-full max-w-lg rounded" />
      <div className="skeleton mt-3 h-24 w-full rounded-xl" />
    </div>
  )
}
