import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { SlackProfile } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { m } from "@/paraglide/messages"

import {
  disconnectSlackProfile,
  slackOrgRequest,
  slackProfiles
} from "../atoms/slack"
import { SlackActionError } from "./ActionError"

export function SlackProfileSettings({
  oauthError
}: Readonly<{ oauthError: boolean }>) {
  const result = useAtomValue(slackProfiles({}))
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.slack_profile_title()}</CardTitle>
        <CardDescription>{m.slack_profile_description()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {oauthError ? (
          <p role="alert" className="text-sm text-destructive">
            {m.slack_oauth_error()}
          </p>
        ) : null}
        {Result.matchWithError(result, {
          onInitial: () => (
            <div className="h-10 animate-pulse rounded-lg bg-muted" />
          ),
          onError: (error) => <ErrorPage contained error={error} />,
          onDefect: (error) => <ErrorPage contained error={error} />,
          onSuccess: ({ value }) =>
            value.length ? (
              value.map((profile) => (
                <ProfileRow key={profile.orgSlug} profile={profile} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {m.slack_profile_empty()}
              </p>
            )
        })}
      </CardContent>
    </Card>
  )
}
function ProfileRow({ profile }: Readonly<{ profile: SlackProfile }>) {
  const req = slackOrgRequest(profile.orgSlug)
  const disconnect = useAtomSet(disconnectSlackProfile(req), {
    mode: "promiseExit"
  })
  const state = useAtomValue(disconnectSlackProfile(req))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={state.waiting ? "animate-pulse" : undefined}>
          <p className="text-sm font-medium">
            {profile.orgName} · {profile.teamName}
          </p>
          <p className="text-xs text-muted-foreground">
            {profile.slackUserId
              ? m.slack_profile_connected({
                  name: profile.displayName ?? profile.slackUserId
                })
              : m.slack_profile_unlinked()}
          </p>
        </div>
        {profile.slackUserId ? (
          <Button
            variant="secondary"
            disabled={state.waiting}
            onClick={() => void disconnect()}
          >
            {m.slack_disconnect()}
          </Button>
        ) : (
          <Button
            render={
              <a
                href={`/api/integrations/slack/oauth/start?orgSlug=${encodeURIComponent(profile.orgSlug)}`}
              />
            }
          >
            {m.slack_profile_connect()}
          </Button>
        )}
      </div>
      <SlackActionError result={state} />
    </div>
  )
}
