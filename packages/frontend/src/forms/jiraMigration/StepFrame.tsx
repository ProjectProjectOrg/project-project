import type { ReactNode } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function StepFrame({
  title,
  description,
  children,
  waiting,
  error,
  nextLabel,
  onBack,
  onNext
}: {
  title: string
  description: string
  children: ReactNode
  waiting: boolean
  error: string | null
  nextLabel?: string
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="flex min-h-[520px] flex-col">
      <div className="flex flex-1 flex-col gap-7 px-5 py-6 sm:px-8 sm:py-8">
        <div className="max-w-[65ch]">
          <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground text-pretty">
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
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-8">
        <Button
          type="button"
          variant="ghost"
          leadingIcon={ArrowLeft}
          disabled={waiting}
          onClick={onBack}
        >
          {m.jira_migration_action_back()}
        </Button>
        <Button
          type="button"
          trailingIcon={ArrowRight}
          disabled={waiting}
          loading={waiting}
          onClick={onNext}
        >
          {nextLabel ?? m.jira_migration_action_continue()}
        </Button>
      </div>
    </div>
  )
}
