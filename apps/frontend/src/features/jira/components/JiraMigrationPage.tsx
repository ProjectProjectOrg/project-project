import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  JiraConnection,
  JiraMigrationDetail,
  JiraMigrationStatus,
  JiraMigrationSummary,
  JiraProjectChoice,
  JiraSite
} from "@pp/shared"
import { Link, useBlocker, useNavigate } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useRef, useState } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import {
  cancelJiraMigrationAtom,
  createJiraMigrationAtom,
  discardJiraMigrationAtom,
  jiraMigrationAtom,
  jiraMigrationKey,
  jiraMigrationsAtom,
  jiraOrgRequest,
  jiraProfileAtom,
  jiraProjectsAtom,
  jiraProjectsRequest,
  jiraSitesAtom,
  rescanJiraMigrationAtom,
  runJiraMigrationAtom
} from "@/features/jira/atoms/jiraMigration"
import { JiraMigrationForm, type JiraDraftSave } from "@/features/jira/form"
import { useJiraMigrationPolling } from "@/features/jira/hooks/useJiraMigrationPolling"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import {
  isJiraMappingStep,
  isJiraWizardStep,
  jiraMigrationStageForStep,
  jiraMigrationStages,
  JiraMigrationShell,
  type JiraMappingStep,
  type JiraMigrationStep,
  type JiraWizardStep
} from "./JiraMigrationShell"
import { JiraProgressStep } from "./JiraProgressStep"
import { JiraSourceStep } from "./JiraSourceStep"
import { JiraTerminalStep } from "./JiraTerminalStep"
import { isActiveJiraMigration, jiraMigrationScreen } from "./screen"

export function JiraMigrationStartPage({ orgSlug }: { orgSlug: string }) {
  const profile = useAtomValue(jiraProfileAtom)
  const refreshProfile = useAtomRefresh(jiraProfileAtom)
  const migrations = useAtomValue(jiraMigrationsAtom(jiraOrgRequest(orgSlug)))

  return Result.matchWithError(profile, {
    onInitial: () => (
      <JiraMigrationStartShell orgSlug={orgSlug} migrations={migrations}>
        <SourceSkeleton />
      </JiraMigrationStartShell>
    ),
    onError: (error) => (
      <JiraMigrationStartShell orgSlug={orgSlug} migrations={migrations}>
        <ErrorPage error={error} reset={refreshProfile} contained />
      </JiraMigrationStartShell>
    ),
    onDefect: (defect) => (
      <JiraMigrationStartShell orgSlug={orgSlug} migrations={migrations}>
        <ErrorPage error={defect} reset={refreshProfile} contained />
      </JiraMigrationStartShell>
    ),
    onSuccess: ({ value }) => (
      <JiraMigrationShell
        orgSlug={orgSlug}
        currentStep={value.status === "connected" ? "choose" : "connect"}
      >
        <SourceForConnection orgSlug={orgSlug} connection={value} />
        <ResumeRegion orgSlug={orgSlug} result={migrations} />
      </JiraMigrationShell>
    )
  })
}

function JiraMigrationStartShell({
  orgSlug,
  migrations,
  children
}: {
  orgSlug: string
  migrations: Result.AsyncResult<ReadonlyArray<JiraMigrationSummary>, unknown>
  children: React.ReactNode
}) {
  return (
    <JiraMigrationShell orgSlug={orgSlug} currentStep="connect">
      {children}
      <ResumeRegion orgSlug={orgSlug} result={migrations} />
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
        migrationApiAvailable
        oauthReturnPath={`/orgs/${orgSlug}/migrations/jira`}
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
  const refreshSites = useAtomRefresh(jiraSitesAtom)
  const refreshProfile = useAtomRefresh(jiraProfileAtom)
  const retrySites = () => {
    refreshProfile()
    refreshSites()
  }
  const create = useAtomSet(createJiraMigrationAtom(jiraOrgRequest(orgSlug)), {
    mode: "promiseExit"
  })
  const createResult = useAtomValue(
    createJiraMigrationAtom(jiraOrgRequest(orgSlug))
  )
  const navigate = useNavigate()
  const requestId = useRef<string | null>(null)
  const [cloudId, setCloudId] = useState("")
  const [projectId, setProjectId] = useState("")
  const scanError = Result.matchWithError(createResult, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: () => m.jira_migration_error_generic(),
    onDefect: () => m.jira_migration_error_generic()
  })

  const changeCloudId = (nextCloudId: string) => {
    requestId.current = null
    setCloudId(nextCloudId)
  }
  const changeProjectId = (nextProjectId: string) => {
    requestId.current = null
    setProjectId(nextProjectId)
  }
  const scan = async () => {
    requestId.current ??= makeRequestId()
    const exit = await create({
      requestId: requestId.current,
      cloudId,
      projectId
    })
    if (Exit.isSuccess(exit)) {
      await navigate({
        to: "/orgs/$orgSlug/migrations/jira/$migrationId",
        params: { orgSlug, migrationId: exit.value.id }
      })
    }
  }

  return Result.matchWithError(sitesResult, {
    onInitial: () => (
      <SourceView
        orgSlug={orgSlug}
        connection={connection}
        sites={[]}
        projects={[]}
        cloudId={cloudId}
        projectId={projectId}
        setCloudId={changeCloudId}
        setProjectId={changeProjectId}
        sitesLoading
        scanWaiting={createResult.waiting}
        scanError={scanError}
        onScan={() => void scan()}
      />
    ),
    onError: (error) => (
      <ErrorPage error={error} reset={retrySites} contained />
    ),
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={retrySites} contained />
    ),
    onSuccess: ({ value }) => (
      <ProjectsSource
        orgSlug={orgSlug}
        connection={connection}
        sites={value}
        cloudId={cloudId}
        projectId={projectId}
        setCloudId={changeCloudId}
        setProjectId={changeProjectId}
        scanWaiting={createResult.waiting}
        scanError={scanError}
        onScan={() => void scan()}
      />
    )
  })
}

function makeRequestId(): string {
  const [first, second] = Effect.runSync(
    Effect.all([Random.nextInt, Random.nextInt])
  )
  return `jira-${Math.abs(first).toString(36)}-${Math.abs(second).toString(36)}`
}

function ProjectsSource({
  orgSlug,
  connection,
  sites,
  cloudId,
  projectId,
  setCloudId,
  setProjectId,
  scanWaiting,
  scanError,
  onScan
}: {
  orgSlug: string
  connection: JiraConnection
  sites: ReadonlyArray<JiraSite>
  cloudId: string
  projectId: string
  setCloudId: (value: string) => void
  setProjectId: (value: string) => void
  scanWaiting: boolean
  scanError: string | null
  onScan: () => void
}) {
  const projectsAtom = jiraProjectsAtom(jiraProjectsRequest(cloudId))
  const projectsResult = useAtomValue(projectsAtom)
  const refreshProjects = useAtomRefresh(projectsAtom)
  const refreshProfile = useAtomRefresh(jiraProfileAtom)
  const retryProjects = () => {
    refreshProfile()
    refreshProjects()
  }

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
        scanWaiting={scanWaiting}
        scanError={scanError}
        onScan={onScan}
      />
    ),
    onError: (error) => (
      <ErrorPage error={error} reset={retryProjects} contained />
    ),
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={retryProjects} contained />
    ),
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
        scanWaiting={scanWaiting}
        scanError={scanError}
        onScan={onScan}
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
  projectsLoading,
  scanWaiting,
  scanError,
  onScan
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
  scanWaiting: boolean
  scanError: string | null
  onScan: () => void
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
      migrationApiAvailable
      oauthReturnPath={`/orgs/${orgSlug}/migrations/jira`}
      scanWaiting={scanWaiting}
      scanError={scanError}
      onScan={onScan}
    />
  )
}

function ResumeRegion({
  orgSlug,
  result
}: {
  orgSlug: string
  result: Result.AsyncResult<ReadonlyArray<JiraMigrationSummary>, unknown>
}) {
  const refreshMigrations = useAtomRefresh(
    jiraMigrationsAtom(jiraOrgRequest(orgSlug))
  )
  return (
    <div className="border-t border-border py-6">
      <h2 className="text-sm font-semibold text-foreground">
        {m.jira_migration_resume_title()}
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {m.jira_migration_resume_description()}
      </p>
      <div className="mt-4">
        {Result.matchWithError(result, {
          onInitial: () => (
            <p className="text-sm text-muted-foreground">
              {m.jira_migration_resume_loading()}
            </p>
          ),
          onError: (error) => (
            <ErrorPage error={error} reset={refreshMigrations} contained />
          ),
          onDefect: (defect) => (
            <ErrorPage error={defect} reset={refreshMigrations} contained />
          ),
          onSuccess: ({ value }) =>
            value.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {m.jira_migration_resume_empty()}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {value.map((migration) => (
                  <li key={migration.id}>
                    <Link
                      to="/orgs/$orgSlug/migrations/jira/$migrationId"
                      params={{ orgSlug, migrationId: migration.id }}
                      className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-accent/60 active:scale-[0.97]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {migration.sourceProjectName}
                        </span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {migration.sourceProjectKey}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        <span className="block">
                          {migrationStatusLabel(migration.status)}
                        </span>
                        <span className="block">
                          {new Intl.DateTimeFormat(getLocale(), {
                            dateStyle: "medium"
                          }).format(DateTime.toDate(migration.updatedAt))}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
        })}
      </div>
    </div>
  )
}

export function JiraMigrationItemPage({
  orgSlug,
  migrationId
}: {
  orgSlug: string
  migrationId: string
}) {
  const key = jiraMigrationKey(orgSlug, migrationId)
  const detailAtom = jiraMigrationAtom(key)
  const detail = useAtomValue(detailAtom)
  const refreshDetail = useAtomRefresh(detailAtom)

  return Result.matchWithError(detail, {
    onInitial: () => (
      <JiraMigrationShell orgSlug={orgSlug} currentStep="snapshot">
        <SourceSkeleton />
      </JiraMigrationShell>
    ),
    onError: (error) => <ErrorPage error={error} reset={refreshDetail} />,
    onDefect: (defect) => <ErrorPage error={defect} reset={refreshDetail} />,
    onSuccess: ({ value, waiting }) => (
      <JiraMigrationDetailPage
        orgSlug={orgSlug}
        detail={value}
        waiting={waiting}
      />
    )
  })
}

function JiraMigrationDetailPage({
  orgSlug,
  detail,
  waiting
}: {
  orgSlug: string
  detail: JiraMigrationDetail
  waiting: boolean
}) {
  const key = jiraMigrationKey(orgSlug, detail.id)
  const navigate = useNavigate()
  const run = useAtomSet(runJiraMigrationAtom(key), { mode: "promiseExit" })
  const rescan = useAtomSet(rescanJiraMigrationAtom(key), {
    mode: "promiseExit"
  })
  const cancel = useAtomSet(cancelJiraMigrationAtom(key), {
    mode: "promiseExit"
  })
  const discard = useAtomSet(discardJiraMigrationAtom(key), {
    mode: "promiseExit"
  })
  const runState = useAtomValue(runJiraMigrationAtom(key))
  const rescanState = useAtomValue(rescanJiraMigrationAtom(key))
  const cancelState = useAtomValue(cancelJiraMigrationAtom(key))
  const discardState = useAtomValue(discardJiraMigrationAtom(key))
  const actionError =
    jiraMigrationActionError(runState) ??
    jiraMigrationActionError(rescanState) ??
    jiraMigrationActionError(cancelState) ??
    jiraMigrationActionError(discardState)
  const busy =
    waiting ||
    runState.waiting ||
    rescanState.waiting ||
    cancelState.waiting ||
    discardState.waiting
  const screen = jiraMigrationScreen(detail.status)
  const attachmentCorrection =
    detail.failedAttachmentIds.length > 0 &&
    detail.destinationProjectSlug !== null
  const [step, setStep] = useState<JiraWizardStep>("snapshot")
  const [lastMappingStep, setLastMappingStep] =
    useState<JiraMappingStep>("statuses")
  const [furthestStep, setFurthestStep] =
    useState<JiraMigrationStep>("snapshot")
  const [reconfiguring, setReconfiguring] = useState(false)
  const draftSaveRef = useRef<JiraDraftSave | null>(null)
  useBlocker({
    disabled: !(
      (screen === "configuration" ||
        (reconfiguring && detail.actions.canConfigure)) &&
      detail.scanSummary &&
      detail.requirements &&
      !attachmentCorrection
    ),
    shouldBlockFn: async () => !(await draftSaveRef.current?.())
  })
  if (reconfiguring && isActiveJiraMigration(detail.status)) {
    setReconfiguring(false)
  }

  useJiraMigrationPolling(orgSlug, detail.id, detail.status)

  const discardAndLeave = async () => {
    const exit = await discard()
    if (Exit.isSuccess(exit)) {
      await navigate({
        to: "/orgs/$orgSlug/migrations/jira",
        params: { orgSlug }
      })
    }
  }

  if (screen === "scan-progress" || screen === "migration-progress") {
    return (
      <JiraMigrationShell
        orgSlug={orgSlug}
        currentStep={screen === "scan-progress" ? "snapshot" : "migrate"}
      >
        <JiraProgressStep
          detail={detail}
          waiting={busy}
          error={actionError}
          onCancel={() => void cancel({ expectedRevision: detail.revision })}
        />
      </JiraMigrationShell>
    )
  }

  if (
    (screen === "configuration" ||
      (reconfiguring && detail.actions.canConfigure)) &&
    detail.scanSummary &&
    detail.requirements
  ) {
    const navigateWithinJob = async (
      destination: "connect" | "choose" | "snapshot" | "people" | "map"
    ) => {
      if (await draftSaveRef.current?.()) {
        setStep(destination === "map" ? lastMappingStep : destination)
      }
    }
    return (
      <JiraMigrationShell
        orgSlug={orgSlug}
        currentStep={step}
        furthestStep={furthestStep}
        confirmLeave
        onBeforeLeave={
          attachmentCorrection
            ? undefined
            : () => draftSaveRef.current?.() ?? Promise.resolve(false)
        }
        onNavigate={attachmentCorrection ? undefined : navigateWithinJob}
      >
        <JiraMigrationForm
          orgSlug={orgSlug}
          detail={detail}
          step={step}
          draftSaveRef={draftSaveRef}
          onExitCorrection={() => setReconfiguring(false)}
          onStep={(nextStep) => {
            if (stageIndex(nextStep) > stageIndex(furthestStep)) {
              setFurthestStep(nextStep)
            }
            if (isJiraMappingStep(nextStep)) setLastMappingStep(nextStep)
            if (isJiraWizardStep(nextStep)) setStep(nextStep)
          }}
        />
      </JiraMigrationShell>
    )
  }

  if (
    screen === "reconnect" ||
    screen === "failed" ||
    screen === "cancelled" ||
    screen === "succeeded"
  ) {
    return (
      <JiraMigrationShell
        orgSlug={orgSlug}
        currentStep={screen === "succeeded" ? "finish" : "migrate"}
      >
        <JiraTerminalStep
          detail={detail}
          orgSlug={orgSlug}
          waiting={busy}
          error={actionError}
          onRetry={() => void run({ expectedRevision: detail.revision })}
          onReconfigure={() => {
            setStep(attachmentCorrection ? "review" : "people")
            setReconfiguring(true)
          }}
          onRescan={() => void rescan({ expectedRevision: detail.revision })}
          onDiscard={() => void discardAndLeave()}
        />
      </JiraMigrationShell>
    )
  }

  return (
    <JiraMigrationShell orgSlug={orgSlug} currentStep="snapshot">
      <div className="flex min-h-[520px] items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
        {m.jira_migration_item_pending_description()}
      </div>
    </JiraMigrationShell>
  )
}

function jiraMigrationActionError(
  result: Result.AsyncResult<unknown, unknown>
): string | null {
  return Result.matchWithError(result, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: () => m.jira_migration_error_generic(),
    onDefect: () => m.jira_migration_error_generic()
  })
}

function stageIndex(step: JiraMigrationStep) {
  const stage = jiraMigrationStageForStep(step)
  return jiraMigrationStages.findIndex((candidate) => candidate.id === stage)
}

function migrationStatusLabel(status: JiraMigrationStatus): string {
  switch (status) {
    case "scanning":
      return m.jira_migration_status_scanning()
    case "needs_configuration":
      return m.jira_migration_status_needs_configuration()
    case "ready":
      return m.jira_migration_status_ready()
    case "migrating":
      return m.jira_migration_status_migrating()
    case "cancelling":
      return m.jira_migration_status_cancelling()
    case "reconnect_required":
      return m.jira_migration_status_reconnect_required()
    case "failed":
      return m.jira_migration_status_failed()
    case "cancelled":
      return m.jira_migration_status_cancelled()
    case "succeeded":
      return m.jira_migration_status_succeeded()
  }
  status satisfies never
  throw new Error("Unreachable Jira migration status")
}

function SourceSkeleton() {
  return (
    <div className="flex min-h-[520px] flex-col gap-6 py-1">
      <div className="skeleton h-7 w-64 rounded-lg" />
      <div className="skeleton h-4 w-full max-w-lg rounded" />
      <div className="skeleton mt-3 h-24 w-full rounded-xl" />
    </div>
  )
}
