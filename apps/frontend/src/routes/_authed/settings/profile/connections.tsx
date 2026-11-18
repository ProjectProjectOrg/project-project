import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"

import { settingsPage } from "@/components/shell/settings/SettingsLayout"
import { figmaProfileAtom } from "@/features/figma/atoms/figma"
import { Connections } from "@/features/profile/components/Connections"
import { slackProfiles } from "@/features/slack/atoms/slack"
import { m } from "@/paraglide/messages"

const ConnectionsSearch = Schema.Struct({
  error: Schema.optional(Schema.NonEmptyString),
  figmaError: Schema.optional(Schema.NonEmptyString),
  slackError: Schema.optional(Schema.NonEmptyString)
})

export const Route = createFileRoute("/_authed/settings/profile/connections")({
  component: Connections,
  validateSearch: Schema.toStandardSchemaV1(ConnectionsSearch),
  loader: async ({ context: { registry }, abortController }) => {
    await Effect.runPromiseExit(
      Effect.all(
        [
          Registry.getResult(registry, figmaProfileAtom),
          Registry.getResult(registry, slackProfiles({}))
        ],
        { concurrency: "unbounded", mode: "result" }
      ),
      { signal: abortController.signal }
    )
    return settingsPage(
      m.profile_section_connections_title(),
      m.profile_section_connections_description()
    )
  }
})
