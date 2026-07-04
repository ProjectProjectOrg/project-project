import { Link } from "@tanstack/react-router"
import * as m from "@/paraglide/messages"

export function EverhourSetupHint({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{m.time_setup_hint()}</p>
      <Link
        to="/orgs/$orgSlug/projects/$slug/settings/integrations"
        params={{ orgSlug, slug }}
        className="w-fit text-xs font-medium text-foreground underline-offset-2 transition-colors hover:underline"
      >
        {m.time_setup_cta()}
      </Link>
    </div>
  )
}
