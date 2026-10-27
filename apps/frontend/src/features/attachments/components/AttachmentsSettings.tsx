import { useAtomValue } from "@effect/atom-react"
import { getRouteApi } from "@tanstack/react-router"

import { AsyncView } from "@/components/shell/AsyncView"
import { AttachmentsBrowser } from "@/features/attachments/components/attachments-browser"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/settings/integrations/storage/files"
)

export function AttachmentsSettings() {
  const { orgSlug } = routeApi.useParams()
  const orgResult = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const canList = useOrgActor(orgSlug).call("attachments", "list")

  return (
    <AsyncView
      result={orgResult}
      contained
      onInitial={() => <BrowserSkeleton />}
      onSuccess={() =>
        canList ? (
          <AttachmentsBrowser orgSlug={orgSlug} />
        ) : (
          <p className="text-sm text-destructive">
            {m.attachments_error_forbidden()}
          </p>
        )
      }
    />
  )
}

function BrowserSkeleton() {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
      <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  )
}
