import { Link } from "@tanstack/react-router"
import { Logo, Wordmark } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { DitherShell } from "@/components/ui/dither-shell"
import { m } from "@/paraglide/messages"

export function NotFoundPage() {
  return (
    <DitherShell animated>
      <div className="relative flex flex-col items-center gap-4 px-8 pb-2 pt-10 text-foreground">
        <div className="relative flex size-16 items-center justify-center rounded-2xl corner-squircle bg-primary">
          <Logo className="size-10" inverted />
        </div>
        <Wordmark className="h-5 w-auto" />
      </div>

      <div className="relative flex flex-col items-center gap-3 px-8 pb-8 pt-6 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {m.common_not_found_code()}
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {m.common_not_found_title()}
        </h1>
        <p className="max-w-[28ch] text-sm leading-relaxed text-muted-foreground">
          {m.common_not_found_body()}
        </p>
        <Button
          render={<Link to="/" />}
          variant="primary"
          size="lg"
          className="mt-2 w-full"
        >
          {m.common_not_found_home_link()}
        </Button>
      </div>
    </DitherShell>
  )
}
