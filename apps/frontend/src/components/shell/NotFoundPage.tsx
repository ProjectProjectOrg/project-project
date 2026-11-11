import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { DitherShell } from "@/components/ui/dither-shell"
import { m } from "@/paraglide/messages"

type NotFoundPageProps = {
  code?: string
  title?: string
  body?: string
  homeLabel?: string
  contained?: boolean
}

export function NotFoundPage({
  code,
  title,
  body,
  homeLabel,
  contained = false
}: NotFoundPageProps = {}) {
  return (
    <DitherShell animated contained={contained}>
      <div className="relative flex flex-col items-center gap-3 px-8 pt-10 pb-8 text-center">
        {/* oxlint-disable-next-line workspace/type-scale -- a decorative numeral, not text on the scale */}
        <span className="font-mono text-5xl text-muted-foreground">
          {code ?? m.common_not_found_code()}
        </span>
        <h1 className="text-display font-bold text-foreground">
          {title ?? m.common_not_found_title()}
        </h1>
        <p className="max-w-[28ch] text-body leading-relaxed text-muted-foreground">
          {body ?? m.common_not_found_body()}
        </p>
        <Button
          render={<Link to="/" />}
          variant="primary"
          size="lg"
          className="mt-2 w-full"
        >
          {homeLabel ?? m.common_not_found_home_link()}
        </Button>
      </div>
    </DitherShell>
  )
}
