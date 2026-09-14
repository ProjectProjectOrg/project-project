import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { Check, Circle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type JiraMigrationStep =
  | "snapshot"
  | "people"
  | "statuses"
  | "types"
  | "priorities"
  | "planning"
  | "destination"
  | "review"

const steps: ReadonlyArray<{
  id: JiraMigrationStep
  label: () => string
}> = [
  { id: "snapshot", label: m.jira_migration_step_snapshot },
  { id: "people", label: m.jira_migration_step_people },
  { id: "statuses", label: m.jira_migration_step_statuses },
  { id: "types", label: m.jira_migration_step_types },
  { id: "priorities", label: m.jira_migration_step_priorities },
  { id: "planning", label: m.jira_migration_step_planning },
  { id: "destination", label: m.jira_migration_step_destination },
  { id: "review", label: m.jira_migration_step_review }
]

export function JiraMigrationShell({
  orgSlug,
  currentStep,
  children
}: {
  orgSlug: string
  currentStep?: JiraMigrationStep
  children: ReactNode
}) {
  const currentIndex = currentStep
    ? steps.findIndex((step) => step.id === currentStep)
    : -1

  return (
    <div className="flex min-h-full w-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {m.jira_migration_page_title()}
        </h1>
        <Button
          variant="ghost"
          render={<Link to="/orgs/$orgSlug/projects" params={{ orgSlug }} />}
        >
          {m.jira_migration_action_save_leave()}
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-[1032px] flex-1 flex-col gap-5 py-6 md:flex-row md:items-start md:gap-10">
        {currentStep ? (
          <>
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground md:hidden">
              <span className="font-medium text-foreground">
                {currentIndex + 1}/{steps.length}
              </span>
              <span>{steps[currentIndex]?.label()}</span>
            </div>
            <nav
              aria-label={m.jira_migration_page_title()}
              className="hidden w-[172px] shrink-0 flex-col gap-1 md:flex"
            >
              {steps.map((step, index) => {
                const complete = index < currentIndex
                const current = index === currentIndex
                return (
                  <div
                    key={step.id}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "flex min-h-8 items-center gap-2 rounded-lg px-2 text-[13px]",
                      current
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {complete ? (
                      <Check className="size-3.5" strokeWidth={1.75} />
                    ) : (
                      <Circle
                        className={cn("size-3", current && "fill-foreground")}
                        strokeWidth={1.5}
                      />
                    )}
                    <span>{step.label()}</span>
                  </div>
                )
              })}
            </nav>
          </>
        ) : null}

        <section className="min-w-0 flex-1 rounded-2xl border border-border bg-background">
          {children}
        </section>
      </div>
    </div>
  )
}
