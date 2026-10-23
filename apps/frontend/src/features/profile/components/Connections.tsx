import { useAtomValue } from "@effect/atom-react"
import { getRouteApi } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { useEffect, useState } from "react"

import {
  SettingsGroup,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { me } from "@/features/auth/atoms/auth"
import { EverhourRows } from "@/features/everhour/components/EverhourRows"
import { FigmaProfileSettings } from "@/features/figma/components/FigmaProfileSettings"
import { GithubRow } from "@/features/github/components/GithubRow"
import {
  figmaOAuthErrorMessage,
  githubOAuthErrorMessage
} from "@/features/profile/lib/oauthErrors"
import { SlackProfileSettings } from "@/features/slack/components/ProfileSettings"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/profile/connections")

export function Connections() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const viewer = useAtomValue(me())
  const [githubOAuthError] = useState(() =>
    githubOAuthErrorMessage(search.error)
  )
  const [figmaOAuthError] = useState(() =>
    figmaOAuthErrorMessage(search.figmaError)
  )
  const [slackOAuthError] = useState(() =>
    search.slackError ? m.slack_oauth_error() : null
  )

  useEffect(() => {
    if (!search.error && !search.figmaError && !search.slackError) return
    void navigate({ to: ".", search: () => ({}), replace: true })
  }, [navigate, search.error, search.figmaError, search.slackError])

  if (!Result.isSuccess(viewer)) return null
  const user = viewer.value

  return (
    <SettingsSection>
      <SettingsGroup>
        <GithubRow
          connected={user.personalGithub.connected}
          email={user.email}
          oauthError={githubOAuthError}
        />
        <EverhourRows everhour={user.personalEverhour} />
        <FigmaProfileSettings oauthError={figmaOAuthError} />
        <SlackProfileSettings oauthError={slackOAuthError} />
      </SettingsGroup>
    </SettingsSection>
  )
}
