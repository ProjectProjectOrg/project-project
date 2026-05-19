import { Link, useRouter } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { DitherShell } from "@/components/ui/dither-shell"
import { type AppError, errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

type ErrorPageProps = {
  error?: unknown
  reset?: () => void
  code?: string
  title?: string
  body?: string
  retryLabel?: string
  homeLabel?: string
  contained?: boolean
}

export function ErrorPage({
  error,
  reset,
  code,
  title,
  body,
  retryLabel,
  homeLabel,
  contained = false
}: ErrorPageProps) {
  const router = useRouter()
  const detail = detailMessage(error)

  const handleRetry = () => {
    if (reset) reset()
    void router.invalidate()
  }

  return (
    <DitherShell animated contained={contained}>
      <div className="relative flex flex-col items-center gap-3 px-8 pt-10 text-center">
        <span className="font-mono text-5xl font-medium tracking-tight text-muted-foreground">
          {code ?? m.error_page_code()}
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title ?? m.error_page_title()}
        </h1>
        <p className="max-w-[30ch] text-sm leading-relaxed text-muted-foreground">
          {body ?? m.error_page_body()}
        </p>
      </div>

      <div className="relative flex w-full flex-col gap-2 px-8 pb-8 pt-4">
        <Button
          variant="primary"
          size="lg"
          onClick={handleRetry}
          className="w-full"
        >
          {retryLabel ?? m.error_page_retry_button()}
        </Button>
        <Button
          render={<Link to="/" />}
          variant="tertiary"
          size="lg"
          className="w-full"
        >
          {homeLabel ?? m.error_page_home_link()}
        </Button>

        {detail ? (
          <p className="mt-1 break-words text-center font-mono text-[11px] leading-relaxed text-muted-foreground/80">
            {detail}
          </p>
        ) : null}
      </div>
    </DitherShell>
  )
}

function detailMessage(error: unknown): string | null {
  if (!error) return null
  if (isAppError(error)) return errorMessage(error)
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return null
  }
}

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof (error as { _tag: unknown })._tag === "string"
  )
}
