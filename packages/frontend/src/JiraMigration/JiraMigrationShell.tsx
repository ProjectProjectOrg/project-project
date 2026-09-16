import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type JiraMigrationStep =
  | "connect"
  | "choose"
  | "snapshot"
  | "people"
  | "statuses"
  | "types"
  | "priorities"
  | "planning"
  | "destination"
  | "review"
  | "migrate"
  | "finish"

export const jiraMappingSteps = [
  "statuses",
  "types",
  "priorities",
  "planning",
  "destination"
] as const satisfies ReadonlyArray<JiraMigrationStep>

export type JiraMappingStep = (typeof jiraMappingSteps)[number]

export const isJiraMappingStep = (
  step: JiraMigrationStep
): step is JiraMappingStep =>
  (jiraMappingSteps as ReadonlyArray<JiraMigrationStep>).includes(step)

export const jiraWizardSteps = [
  "connect",
  "choose",
  "snapshot",
  "people",
  ...jiraMappingSteps,
  "review"
] as const satisfies ReadonlyArray<JiraMigrationStep>

export type JiraWizardStep = (typeof jiraWizardSteps)[number]

export const isJiraWizardStep = (
  step: JiraMigrationStep
): step is JiraWizardStep =>
  (jiraWizardSteps as ReadonlyArray<JiraMigrationStep>).includes(step)

export const jiraMigrationStages: ReadonlyArray<{
  id:
    | "connect"
    | "choose"
    | "snapshot"
    | "people"
    | "map"
    | "review"
    | "migrate"
    | "finish"
  label: () => string
}> = [
  { id: "connect", label: m.jira_migration_stage_connect },
  { id: "choose", label: m.jira_migration_stage_choose },
  { id: "snapshot", label: m.jira_migration_stage_scan },
  { id: "people", label: m.jira_migration_stage_link },
  { id: "map", label: m.jira_migration_stage_map },
  { id: "review", label: m.jira_migration_stage_review },
  { id: "migrate", label: m.jira_migration_stage_migrate },
  { id: "finish", label: m.jira_migration_stage_finish }
]

export const jiraMigrationStageForStep = (step: JiraMigrationStep) =>
  isJiraMappingStep(step) ? "map" : step

type NavigableJiraMigrationStage =
  | "connect"
  | "choose"
  | "snapshot"
  | "people"
  | "map"

const isNavigableJiraMigrationStage = (
  stage: (typeof jiraMigrationStages)[number]["id"]
): stage is NavigableJiraMigrationStage =>
  stage === "connect" ||
  stage === "choose" ||
  stage === "snapshot" ||
  stage === "people" ||
  stage === "map"

export function JiraMigrationShell({
  orgSlug,
  currentStep,
  furthestStep = currentStep,
  confirmLeave = false,
  onNavigate,
  children
}: {
  orgSlug: string
  currentStep?: JiraMigrationStep
  furthestStep?: JiraMigrationStep
  confirmLeave?: boolean
  onNavigate?: (stage: NavigableJiraMigrationStage) => void
  children: ReactNode
}) {
  const currentStage = currentStep
    ? jiraMigrationStageForStep(currentStep)
    : undefined
  const currentIndex = currentStage
    ? jiraMigrationStages.findIndex((stage) => stage.id === currentStage)
    : -1
  const furthestStage = furthestStep
    ? jiraMigrationStageForStep(furthestStep)
    : undefined
  const furthestIndex = furthestStage
    ? jiraMigrationStages.findIndex((stage) => stage.id === furthestStage)
    : currentIndex

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-[1020px] flex-col">
      <header className="flex min-h-12 items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {m.jira_migration_page_title()}
        </h1>
        <LeaveButton orgSlug={orgSlug} confirmLeave={confirmLeave} />
      </header>

      <div className="flex w-full flex-1 flex-col gap-5 pt-3 md:flex-row md:items-stretch md:gap-10">
        {currentStep ? (
          <>
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground md:hidden">
              <span className="font-medium text-foreground">
                {currentIndex + 1}/{jiraMigrationStages.length}
              </span>
              <span>{jiraMigrationStages[currentIndex]?.label()}</span>
            </div>
            <nav
              aria-label={m.jira_migration_page_title()}
              className="hidden w-40 shrink-0 flex-col gap-1 md:flex"
            >
              {jiraMigrationStages.map((stage, index) => {
                const reachable = index <= furthestIndex
                const current = index === currentIndex
                const complete = reachable && !current
                const navigable =
                  reachable &&
                  !current &&
                  onNavigate !== undefined &&
                  isNavigableJiraMigrationStage(stage.id)
                const content = (
                  <>
                    {complete ? (
                      <Check className="size-3.5" strokeWidth={1.75} />
                    ) : (
                      <span className="w-3.5 shrink-0 text-center font-mono text-xs tabular-nums">
                        {index + 1}
                      </span>
                    )}
                    <span>{stage.label()}</span>
                  </>
                )
                const className = cn(
                  "flex min-h-8 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px]",
                  current
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground",
                  navigable &&
                    "cursor-pointer transition-colors hover:bg-accent/60 hover:text-foreground active:scale-[0.97] active:transition-transform active:duration-100"
                )
                return navigable ? (
                  <button
                    key={stage.id}
                    type="button"
                    className={className}
                    onClick={() => {
                      if (isNavigableJiraMigrationStage(stage.id)) {
                        onNavigate(stage.id)
                      }
                    }}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={stage.id}
                    aria-current={current ? "step" : undefined}
                    className={className}
                  >
                    {content}
                  </div>
                )
              })}
            </nav>
          </>
        ) : null}

        <section className="min-w-0 max-w-[820px] flex-1">{children}</section>
      </div>
    </div>
  )
}

function LeaveButton({
  orgSlug,
  confirmLeave
}: {
  orgSlug: string
  confirmLeave: boolean
}) {
  const leaveLink = (
    <Link to="/orgs/$orgSlug/projects" params={{ orgSlug }} />
  )

  if (!confirmLeave) {
    return (
      <Button variant="ghost" render={leaveLink}>
        {m.jira_migration_action_save_leave()}
      </Button>
    )
  }

  return (
    <ConfirmButton.Root>
      <ConfirmButton.Trigger variant="ghost">
        {m.jira_migration_action_save_leave()}
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm>
        <span className="text-[13px] text-muted-foreground">
          {m.jira_migration_leave_question()}
        </span>
        <Button size="sm" variant="destructive" render={leaveLink}>
          {m.jira_migration_action_leave_confirm()}
        </Button>
        <ConfirmButton.Cancel>{m.common_cancel_button()}</ConfirmButton.Cancel>
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}
