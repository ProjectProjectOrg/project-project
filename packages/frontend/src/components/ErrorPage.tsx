import { Link, useRouter } from "@tanstack/react-router"
import { Logo, Wordmark } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { DitherShell } from "@/components/ui/dither-shell"
import { m } from "@/paraglide/messages"

type ErrorPageProps = {
  error?: unknown
  reset?: () => void
}

export function ErrorPage({ error, reset }: ErrorPageProps) {
  const router = useRouter()
  const detail = errorMessage(error)

  const handleRetry = () => {
    if (reset) reset()
    void router.invalidate()
  }

  return (
    <DitherShell animated>
      <div className="relative flex flex-col items-center gap-4 px-8 pb-2 pt-10 text-foreground">
        <div className="relative flex size-16 items-center justify-center rounded-2xl corner-squircle bg-primary">
          <Logo className="size-10" inverted />
        </div>
        <Wordmark className="h-5 w-auto" />
      </div>

      <div className="relative flex flex-col items-center gap-3 px-8 pb-2 pt-6 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {m.error_page_code()}
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {m.error_page_title()}
        </h1>
        <p className="max-w-[30ch] text-sm leading-relaxed text-muted-foreground">
          {m.error_page_body()}
        </p>
      </div>

      <div className="relative flex w-full flex-col gap-2 px-8 pb-8 pt-4">
        <Button
          variant="primary"
          size="lg"
          onClick={handleRetry}
          className="w-full"
        >
          {m.error_page_retry_button()}
        </Button>
        <Button
          render={<Link to="/" />}
          variant="tertiary"
          size="lg"
          className="w-full"
        >
          {m.error_page_home_link()}
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

function errorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return null
  }
}
