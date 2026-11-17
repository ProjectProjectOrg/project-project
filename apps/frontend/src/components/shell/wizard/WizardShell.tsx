import { Button } from "@pp/ui/button"
import { Check } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import type { ReactNode } from "react"

export type WizardStage<Id extends string> = Readonly<{
  id: Id
  label: () => string
}>

export type WizardNavigation<Navigable extends string> = Readonly<{
  stages: ReadonlyArray<Navigable>
  onNavigate: (stage: Navigable) => void
}>

export function WizardShell<Id extends string, Navigable extends Id = Id>({
  title,
  stages,
  currentStage,
  furthestStage = currentStage,
  navigation,
  action,
  children
}: Readonly<{
  title: string
  stages: ReadonlyArray<WizardStage<Id>>
  currentStage?: Id
  furthestStage?: Id
  navigation?: WizardNavigation<Navigable>
  action: ReactNode
  children: ReactNode
}>) {
  const currentIndex = currentStage
    ? stages.findIndex((stage) => stage.id === currentStage)
    : -1
  const furthestIndex = furthestStage
    ? stages.findIndex((stage) => stage.id === furthestStage)
    : currentIndex

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-[1020px] flex-col">
      <header className="flex min-h-12 items-start justify-between gap-4">
        <h1 className="text-title font-semibold text-foreground">{title}</h1>
        {action}
      </header>

      <div className="flex w-full flex-1 flex-col gap-5 pt-3 md:flex-row md:items-stretch md:gap-10">
        {currentStage ? (
          <>
            <div className="flex items-center gap-2 text-body text-muted-foreground md:hidden">
              <span className="font-semibold text-foreground">
                {currentIndex + 1}/{stages.length}
              </span>
              <span>{stages[currentIndex]?.label()}</span>
            </div>
            <nav
              aria-label={title}
              className="hidden w-40 shrink-0 flex-col gap-1 md:flex"
            >
              {stages.map((stage, index) => {
                const reachable = index <= furthestIndex
                const current = index === currentIndex
                const complete = reachable && !current
                const target =
                  reachable && !current
                    ? navigation?.stages.find(
                        (navigable) => navigable === stage.id
                      )
                    : undefined
                const content = (
                  <>
                    {complete ? (
                      <Check className="size-3.5" strokeWidth={1.75} />
                    ) : (
                      <span className="w-3.5 shrink-0 text-center font-mono text-caption tabular-nums">
                        {index + 1}
                      </span>
                    )}
                    <span>{stage.label()}</span>
                  </>
                )
                return navigation && target !== undefined ? (
                  <Button
                    key={stage.id}
                    type="button"
                    variant="ghost"
                    size="step"
                    className="w-full justify-start rounded-xl text-left text-muted-foreground hover:text-foreground"
                    onClick={() => navigation.onNavigate(target)}
                  >
                    {content}
                  </Button>
                ) : (
                  <div
                    key={stage.id}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "flex min-h-8 w-full items-center gap-3 rounded-xl px-3 text-left text-body",
                      current
                        ? "bg-accent font-semibold text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {content}
                  </div>
                )
              })}
            </nav>
          </>
        ) : null}

        <section className="max-w-[820px] min-w-0 flex-1">{children}</section>
      </div>
    </div>
  )
}
