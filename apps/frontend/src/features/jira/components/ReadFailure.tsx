import type { AsyncFailure } from "@/components/shell/AsyncView"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function ReadFailure<E>({
  failure,
  onRetry,
  className
}: Readonly<{
  failure: AsyncFailure<E>
  onRetry: () => void
  className?: string
}>) {
  const message =
    failure.kind === "error"
      ? errorMessage(failure.error)
      : m.jira_import_error_unexpected()
  return (
    <div
      role="alert"
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <span className="min-w-0 text-body text-muted-foreground">{message}</span>
      <Button variant="tertiary" size="sm" onClick={onRetry}>
        {m.jira_import_action_retry()}
      </Button>
    </div>
  )
}
