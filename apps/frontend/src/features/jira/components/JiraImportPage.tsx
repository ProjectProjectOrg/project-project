import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type {
  JiraMigrationDetail,
  JiraMigrationRequirements,
  JiraMigrationScanSummary
} from "@pp/shared"
import { useState, type ReactNode } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  jiraMigration,
  jiraMigrationRequest
} from "@/features/jira/atoms/jiraMigration"
import {
  JiraImportFormScope,
  type JiraImportForm
} from "@/features/jira/forms/import"
import { ReviewStep } from "@/features/jira/forms/import/ReviewStep"
import { SetupStep } from "@/features/jira/forms/import/SetupStep"
import {
  useImportStep,
  type ImportStepControls
} from "@/features/jira/hooks/useImportStep"
import { useJiraImportDraft } from "@/features/jira/hooks/useJiraImportDraft"
import {
  useJiraImportLifecycle,
  type JiraImportLifecycle
} from "@/features/jira/hooks/useJiraImportLifecycle"
import { useJiraMigrationPolling } from "@/features/jira/hooks/useJiraMigrationPolling"
import { jiraProgressRatio } from "@/features/jira/lib/imports"
import { jiraImportLanding, jiraImportTitle } from "@/features/jira/lib/landing"
import {
  jiraImportPhases,
  jiraPhaseSteps,
  jiraScanPhases
} from "@/features/jira/lib/phases"
import { jiraScanCountLine } from "@/features/jira/lib/scanCounts"
import {
  jiraCancelCopy,
  jiraProgressCount,
  jiraStoppedKind,
  navigableStages
} from "@/features/jira/lib/screen"
import {
  isConfiguringJiraImport,
  jiraImportScreen,
  jiraImportStage,
  type JiraImportScreen
} from "@/features/jira/lib/stages"
import { m } from "@/paraglide/messages"

import { JiraImportShell } from "./JiraImportShell"
import { ImportResult } from "./screens/ImportResult"
import { ImportStopped } from "./screens/ImportStopped"
import { ProgressScreen } from "./screens/ProgressScreen"
import { ScanSummary } from "./screens/ScanSummary"
import { StepSkeleton } from "./StepSkeleton"

export function JiraImportPage({
  orgSlug,
  migrationId
}: Readonly<{ orgSlug: string; migrationId: string }>) {
  const atom = jiraMigration(jiraMigrationRequest(orgSlug, migrationId))
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  const [generation, setGeneration] = useState(0)
  return (
    <AsyncView
      result={result}
      reset={refresh}
      onInitial={() => (
        <JiraImportShell
          orgSlug={orgSlug}
          title={m.jira_import_title_new()}
          stage="scan"
          screenKey="loading"
        >
          <StepSkeleton />
        </JiraImportShell>
      )}
      onSuccess={({ value }) => (
        <JiraImportView
          key={`${value.id}:${value.requirements === null}:${generation}`}
          orgSlug={orgSlug}
          detail={value}
          onReload={() => {
            setGeneration((current) => current + 1)
            refresh()
          }}
        />
      )}
    />
  )
}

function JiraImportView({
  orgSlug,
  detail,
  onReload
}: Readonly<{
  orgSlug: string
  detail: JiraMigrationDetail
  onReload: () => void
}>) {
  useJiraMigrationPolling(orgSlug, detail.id, detail.status)
  const navigation = useImportStep(!isConfiguringJiraImport(detail.status))
  const lifecycle = useJiraImportLifecycle(orgSlug, detail, navigation.clear)
  const draft = useJiraImportDraft(orgSlug, detail.id)
  const [landing] = useState(() => jiraImportLanding(detail))
  const requirements = detail.requirements
  const summary = detail.scanSummary
  const hasScan = requirements !== null && summary !== null
  const screen = jiraImportScreen({
    status: detail.status,
    hasScan,
    canConfigure: detail.actions.canConfigure,
    step: navigation.step,
    reconfigure: navigation.reconfigure,
    landing
  })
  const stage = jiraImportStage(screen, hasScan)
  const navigable = navigableStages(detail, hasScan)
  const names = jiraImportTitle(detail)
  const reload = () => {
    draft.dismiss()
    onReload()
  }

  const shell = (children: ReactNode) => (
    <JiraImportShell
      orgSlug={orgSlug}
      title={m.jira_import_title({
        source: names.source,
        destination: names.destination
      })}
      stage={stage}
      done={detail.status === "succeeded"}
      navigable={navigable}
      onStage={(target) =>
        navigation.goTo(
          target === "import" || target === "source" ? undefined : target
        )
      }
      screenKey={screen}
    >
      {children}
    </JiraImportShell>
  )

  if (!hasScan)
    return shell(
      <StatusScreen
        orgSlug={orgSlug}
        detail={detail}
        screen={screen}
        lifecycle={lifecycle}
        onStep={navigation.goTo}
      />
    )

  return (
    <JiraImportFormScope
      requirements={requirements}
      configuration={detail.configuration}
      onStart={lifecycle.run}
      onInvalid={() => navigation.goTo("setup")}
    >
      {(form) =>
        shell(
          <ConfiguredScreen
            orgSlug={orgSlug}
            detail={detail}
            requirements={requirements}
            summary={summary}
            screen={screen}
            form={form}
            lifecycle={lifecycle}
            draft={draft}
            navigation={navigation}
            onReload={reload}
          />
        )
      }
    </JiraImportFormScope>
  )
}

function ConfiguredScreen({
  orgSlug,
  detail,
  requirements,
  summary,
  screen,
  form,
  lifecycle,
  draft,
  navigation,
  onReload
}: Readonly<{
  orgSlug: string
  detail: JiraMigrationDetail
  requirements: JiraMigrationRequirements
  summary: JiraMigrationScanSummary
  screen: JiraImportScreen
  form: JiraImportForm
  lifecycle: JiraImportLifecycle
  draft: ReturnType<typeof useJiraImportDraft>
  navigation: ImportStepControls
  onReload: () => void
}>) {
  const returnPath = `/orgs/${orgSlug}/migrations/jira/${detail.id}`
  switch (screen) {
    case "scan-summary":
      return (
        <ScanSummary
          summary={summary}
          findings={detail.findings ?? []}
          canRescan={detail.actions.canRescan}
          waiting={lifecycle.waiting}
          error={lifecycle.error}
          onRescan={lifecycle.rescan}
          onContinue={() => navigation.goTo("setup")}
        />
      )
    case "setup":
      return (
        <SetupStep
          form={form}
          orgSlug={orgSlug}
          detail={detail}
          requirements={requirements}
          draft={draft}
          focusSection={navigation.section}
          onFocusSection={navigation.openSection}
          onBack={() => navigation.goTo("scan")}
          onContinue={() => navigation.goTo("review")}
          onReload={onReload}
          returnPath={returnPath}
        />
      )
    case "review":
      return (
        <ReviewStep
          form={form}
          orgSlug={orgSlug}
          detail={detail}
          requirements={requirements}
          summary={summary}
          draft={draft}
          starting={lifecycle.waiting}
          startError={lifecycle.error}
          onChangeSection={(section) => navigation.goTo("setup", section)}
          onBack={() => navigation.goTo("setup")}
          onReload={onReload}
          returnPath={returnPath}
        />
      )
    default:
      return (
        <StatusScreen
          orgSlug={orgSlug}
          detail={detail}
          screen={screen}
          lifecycle={lifecycle}
          onStep={navigation.goTo}
        />
      )
  }
}

function StatusScreen({
  orgSlug,
  detail,
  screen,
  lifecycle,
  onStep
}: Readonly<{
  orgSlug: string
  detail: JiraMigrationDetail
  screen: JiraImportScreen
  lifecycle: JiraImportLifecycle
  onStep: ImportStepControls["goTo"]
}>) {
  const progress = detail.progress
  const cancel = detail.actions.canCancel
    ? { ...jiraCancelCopy(screen), onConfirm: lifecycle.cancel }
    : null
  const progressProps = {
    count: jiraProgressCount(progress),
    ratio: jiraProgressRatio(progress),
    error: lifecycle.error,
    waiting: lifecycle.waiting,
    cancel
  }
  switch (screen) {
    case "scan-progress":
      return (
        <ProgressScreen
          {...progressProps}
          title={
            progress.phase === "queued_scan"
              ? m.jira_import_scan_queued_title()
              : m.jira_import_scan_title({ project: detail.sourceProjectName })
          }
          description={m.jira_import_scan_description()}
          phases={jiraPhaseSteps(jiraScanPhases, progress)}
          scanCounts={jiraScanCountLine(detail.scanCounts)}
        />
      )
    case "import-progress":
      return (
        <ProgressScreen
          {...progressProps}
          title={
            detail.status === "cancelling"
              ? m.jira_import_cancelling_title()
              : m.jira_import_importing_title({
                  project: detail.sourceProjectName
                })
          }
          description={m.jira_import_importing_description()}
          phases={jiraPhaseSteps(jiraImportPhases, progress)}
        />
      )
    case "result":
      return <ImportResult orgSlug={orgSlug} detail={detail} />
    default:
      return (
        <ImportStopped
          orgSlug={orgSlug}
          detail={detail}
          kind={jiraStoppedKind(screen)}
          lifecycle={lifecycle}
          onFixSetup={() => onStep("setup")}
          onLeaveOutFiles={() => onStep("review")}
        />
      )
  }
}
