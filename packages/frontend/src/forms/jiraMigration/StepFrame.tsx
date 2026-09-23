import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function StepFrame({
  title,
  description,
  children,
  waiting,
  error,
  nextLabel,
  nextDisabled = false,
  showBack = true,
  onBack,
  onNext
}: Readonly<{
  title: string
  description: string
  children: ReactNode
  waiting: boolean
  error: string | null
  nextLabel?: string
  nextDisabled?: boolean
  showBack?: boolean
  onBack: () => void
  onNext: () => void
}>) {
  return (
    <div className="flex min-h-[650px] flex-col">
      <div className="flex flex-1 flex-col gap-6 pb-8 pt-1">
        <div className="max-w-[65ch]">
          <h2 className="text-lg font-semibold tracking-tight text-foreground text-balance">
            {title}
          </h2>
          <p className="mt-1.5 text-sm leading-[21px] text-muted-foreground text-pretty">
            {description}
          </p>
        </div>
        <div className={waiting ? "animate-pulse" : undefined}>{children}</div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex h-[72px] items-center justify-between gap-3 border-t border-border px-4">
        {showBack ? (
          <Button
            type="button"
            variant="ghost"
            disabled={waiting}
            onClick={onBack}
          >
            {m.jira_migration_action_back()}
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          disabled={waiting || nextDisabled}
          loading={waiting}
          onClick={onNext}
        >
          {nextLabel ?? m.jira_migration_action_continue()}
        </Button>
      </div>
    </div>
  )
}
