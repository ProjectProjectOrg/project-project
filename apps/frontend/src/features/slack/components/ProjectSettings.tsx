import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { SlackProjectForm } from "@/forms/slack-project"
import { m } from "@/paraglide/messages"

import { slackProject, slackProjectRequest } from "../atoms/slack"

export function SlackProjectSettings({
  orgSlug,
  slug,
  canManage
}: Readonly<{ orgSlug: string; slug: string; canManage: boolean }>) {
  const result = useAtomValue(slackProject(slackProjectRequest(orgSlug, slug)))
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <h2 className="text-sm font-medium">{m.slack_heading()}</h2>
      {Result.matchWithError(result, {
        onInitial: () => (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ),
        onError: (error) => <ErrorPage contained error={error} />,
        onDefect: (error) => <ErrorPage contained error={error} />,
        onSuccess: ({ value, waiting }) =>
          !value.workspace ? (
            <p className="text-sm text-muted-foreground">
              {m.slack_project_unavailable()}
            </p>
          ) : (
            <>
              <p
                className={
                  waiting
                    ? "animate-pulse text-xs text-muted-foreground"
                    : "text-xs text-muted-foreground"
                }
              >
                {m.slack_connected({ workspace: value.workspace.teamName })}
                {value.settings ? ` · #${value.settings.channelName}` : ""}
              </p>
              {canManage ? (
                <SlackProjectForm
                  key={value.workspace.teamId}
                  orgSlug={orgSlug}
                  slug={slug}
                  status={value}
                />
              ) : null}
            </>
          )
      })}
      <p className="text-xs text-muted-foreground">{m.slack_preview_hint()}</p>
    </section>
  )
}
