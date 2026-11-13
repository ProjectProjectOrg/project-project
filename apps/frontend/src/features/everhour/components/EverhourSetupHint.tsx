import { Link } from "@tanstack/react-router"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import * as m from "@/paraglide/messages"

export function EverhourSetupHint({ onDismiss }: { onDismiss?: () => void }) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-caption text-muted-foreground">
          {m.time_setup_hint()}
        </p>
        <Link
          to="/orgs/$orgSlug/projects/$slug/settings/integrations"
          params={{ orgSlug, slug }}
          className="w-fit text-caption font-semibold text-foreground underline-offset-2 transition-colors hover:underline"
        >
          {m.time_setup_cta()}
        </Link>
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={m.time_setup_dismiss()}
          onClick={onDismiss}
          className="-mt-0.5 shrink-0 text-muted-foreground"
        >
          <X strokeWidth={1.75} />
        </Button>
      )}
    </div>
  )
}
