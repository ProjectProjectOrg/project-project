import { Link } from "@tanstack/react-router"
import { Check } from "lucide-react"
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion
} from "motion/react"
import { useRef, type ReactNode } from "react"

import { PageContainer, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import { WeightLabel } from "@/components/ui/weight-label"
import {
  jiraImportStageIndex,
  jiraImportStageLabel,
  jiraImportStages,
  type JiraImportStage
} from "@/features/jira/lib/stages"
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/useFluidHover"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { IconSwap } from "./IconSwap"

const noStages: ReadonlyArray<JiraImportStage> = []

export function JiraImportShell({
  orgSlug,
  title,
  stage,
  done = false,
  navigable = noStages,
  onStage,
  screenKey,
  children
}: Readonly<{
  orgSlug: string
  title: string
  stage: JiraImportStage
  done?: boolean
  navigable?: ReadonlyArray<JiraImportStage>
  onStage?: (stage: JiraImportStage) => void
  screenKey: string
  children: ReactNode
}>) {
  const currentIndex = jiraImportStageIndex(stage)
  return (
    <MotionConfig reducedMotion="user">
      <div className="absolute inset-0 flex flex-col px-6 pt-6">
        <PageContainer width="focused" className="min-h-0 flex-1 gap-0">
          <header className="flex h-12 shrink-0 items-start justify-between gap-4">
            <PageHeader className="min-w-0 [&>h1]:truncate">
              <h1>{title}</h1>
            </PageHeader>
            <Button
              variant="ghost"
              render={
                <Link
                  to="/orgs/$orgSlug/migrations/jira"
                  params={{ orgSlug }}
                />
              }
            >
              {m.jira_import_action_all_imports()}
            </Button>
          </header>

          <div className="flex min-h-0 w-full flex-1 flex-col gap-5 pt-3 md:flex-row md:gap-10">
            <p className="shrink-0 text-body text-muted-foreground md:hidden">
              {m.jira_import_stage_position({
                position: String(currentIndex + 1),
                total: String(jiraImportStages.length),
                stage: jiraImportStageLabel(stage)
              })}
            </p>
            <StageRail
              currentIndex={currentIndex}
              done={done}
              navigable={navigable}
              onStage={onStage}
            />
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={screenKey}
                  className="flex min-h-0 flex-1 flex-col"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: spring.slow.exit }}
                  transition={spring.slow}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </section>
          </div>
        </PageContainer>
      </div>
    </MotionConfig>
  )
}

function StageRail({
  currentIndex,
  done,
  navigable,
  onStage
}: Readonly<{
  currentIndex: number
  done: boolean
  navigable: ReadonlyArray<JiraImportStage>
  onStage?: (stage: JiraImportStage) => void
}>) {
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)

  return (
    <nav
      aria-label={m.jira_import_stages_label()}
      className="hidden w-40 shrink-0 md:block"
    >
      <div
        ref={listRef}
        role="presentation"
        onMouseEnter={hover.handlers.onMouseEnter}
        onMouseMove={hover.handlers.onMouseMove}
        onMouseLeave={hover.handlers.onMouseLeave}
        onClick={hover.handlers.onClick}
        className="relative"
      >
        <FluidHoverHighlight hover={hover} className="rounded-lg" />
        <ol className="flex flex-col">
          {jiraImportStages.map((stage, index) => (
            <StageItem
              key={stage}
              stage={stage}
              index={index}
              current={index === currentIndex}
              complete={
                index < currentIndex || (done && index === currentIndex)
              }
              interactive={
                onStage !== undefined &&
                index !== currentIndex &&
                navigable.includes(stage)
              }
              registerItem={hover.registerItem}
              onSelect={() => onStage?.(stage)}
            />
          ))}
        </ol>
      </div>
    </nav>
  )
}

function StageItem({
  stage,
  index,
  current,
  complete,
  interactive,
  registerItem,
  onSelect
}: Readonly<{
  stage: JiraImportStage
  index: number
  current: boolean
  complete: boolean
  interactive: boolean
  registerItem: (index: number, element: HTMLElement | null) => void
  onSelect: () => void
}>) {
  const ref = useRef<HTMLLIElement>(null)
  const reduceMotion = useReducedMotion() ?? false
  useRegisterFluidHoverItem(interactive ? registerItem : undefined, index, ref)
  const label = jiraImportStageLabel(stage)
  const content = (
    <>
      {current ? (
        <motion.span
          aria-hidden
          layoutId="jira-import-stage"
          className="absolute inset-0 -z-10 rounded-lg bg-active"
          transition={reduceMotion ? { duration: 0 } : spring.moderate}
        />
      ) : null}
      <IconSwap
        showSecond={complete}
        first={
          <span className="font-mono text-caption tabular-nums">{index + 1}</span>
        }
        second={<Check className="size-3.5" strokeWidth={1.75} />}
      />
      <WeightLabel active={current} truncate>
        {label}
      </WeightLabel>
    </>
  )
  const className = cn(
    "relative z-10 flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-body transition-colors duration-80",
    current ? "text-foreground" : "text-muted-foreground"
  )
  return (
    <li ref={ref} className="relative">
      {interactive ? (
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            className,
            "cursor-pointer transition-[color,transform] active:scale-[0.97] data-[fluid-hover-active]:text-foreground"
          )}
        >
          {content}
        </button>
      ) : (
        <div aria-current={current ? "step" : undefined} className={className}>
          {content}
        </div>
      )}
    </li>
  )
}
