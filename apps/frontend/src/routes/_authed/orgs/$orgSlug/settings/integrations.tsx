import { useAtomValue } from "@effect/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import { slackOrg, slackOrgRequest } from "@/features/slack/atoms/slack"
import { SlackAppSetup } from "@/features/slack/components/AppSetup"
import { SlackConnectionForm } from "@/forms/slack-connection"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations"
)({
  component: IntegrationsSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_settings_integrations_tab() }
  })
})

function IntegrationsSettings() {
  const { orgSlug } = Route.useParams()
  return useOrgActor(orgSlug).call("slack", "orgStatus") ? (
    <section className="flex max-w-2xl flex-col gap-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{m.slack_heading()}</h2>
        <p className="text-sm text-muted-foreground">{m.slack_description()}</p>
      </div>
      <SlackConnection orgSlug={orgSlug} />
    </section>
  ) : (
    <ErrorPage contained />
  )
}
function SlackConnection({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const req = slackOrgRequest(orgSlug)
  const status = useAtomValue(slackOrg(req))
  return Result.matchWithError(status, {
    onInitial: () => <div className="h-48 animate-pulse rounded-lg bg-muted" />,
    onError: (error) => <ErrorPage contained error={error} />,
    onDefect: (error) => <ErrorPage contained error={error} />,
    onSuccess: ({ value }) => (
      <div className="flex max-w-2xl flex-col gap-8">
        <SlackConnectionForm orgSlug={orgSlug} status={value} />
        {value.connection ? (
          <>
            <div className="divide-y divide-border">
              <div className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="max-w-md space-y-1">
                  <h2 className="text-sm font-medium">
                    {m.slack_notifications_heading()}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {m.slack_notifications_description()}
                  </p>
                  <code className="block pt-1 text-xs text-muted-foreground">
                    {m.slack_invite_command()}
                  </code>
                </div>
                <Button
                  variant="secondary"
                  render={
                    <Link to="/orgs/$orgSlug/projects" params={{ orgSlug }} />
                  }
                >
                  {m.slack_view_projects()}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="max-w-md space-y-1">
                  <h2 className="text-sm font-medium">
                    {m.slack_previews_heading()}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {m.slack_previews_description()}
                  </p>
                </div>
                <Button variant="secondary" render={<Link to="/profile" />}>
                  {m.slack_manage_account()}
                </Button>
              </div>
            </div>
            <details className="text-sm">
              <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                {m.slack_app_configuration()}
              </summary>
              <div className="pt-5">
                <SlackAppSetup orgSlug={orgSlug} />
              </div>
            </details>
          </>
        ) : null}
      </div>
    )
  })
}
