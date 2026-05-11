// Connected agents card on the profile page.
//
// Lists OAuth clients (typically MCP agents) that have completed an
// authorization with the user's account and lets them revoke any of them.
// Schema comes from /api/oauth-applications; see shared/schemas/OAuthApplication.

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import {
  oauthApplicationsAtom,
  revokeOAuthApplicationAtom
} from "@/atoms/oauthApplications"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import type { OAuthApplication } from "@projectproject/shared"

export function ConnectedAgentsSection() {
  const applications = useAtomValue(oauthApplicationsAtom)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.profile_section_connected_agents_title()}</CardTitle>
        <CardDescription>
          {m.profile_section_connected_agents_description()}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {Result.isSuccess(applications) ? (
          applications.value.length === 0 ? (
            <p className="text-muted-foreground">
              {m.profile_connected_agents_empty()}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-background">
              {applications.value.map((app) => (
                <li key={app.id}>
                  <AgentRow app={app} />
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

function AgentRow({ app }: { app: OAuthApplication }) {
  const revoke = useAtomSet(revokeOAuthApplicationAtom)
  const revokeState = useAtomValue(revokeOAuthApplicationAtom)
  const busy = revokeState.waiting
  const locale = getLocale()

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <KeyRound className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium">{app.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{app.clientId}</span>
          <span className="mx-1.5">·</span>
          {m.profile_connected_agents_connected_at({
            date: app.createdAt.toLocaleDateString(locale)
          })}
          <span className="mx-1.5">·</span>
          {app.lastUsedAt
            ? m.profile_connected_agents_last_used_at({
                date: app.lastUsedAt.toLocaleDateString(locale)
              })
            : m.profile_connected_agents_never_used()}
        </div>
      </div>
      <Button
        variant="tertiary"
        size="sm"
        disabled={busy}
        onClick={() => revoke({ id: app.id })}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        {m.profile_connected_agents_revoke()}
      </Button>
    </div>
  )
}
