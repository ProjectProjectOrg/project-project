import { useAtomValue } from "@effect/atom-react"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Redirect } from "expo-router"

import { LoadFailed } from "@/components/LoadFailed"
import { lastUsedOrg, savedServers } from "@/servers/atoms"
import { startLocation } from "@/servers/startLocation"

export default function Index() {
  const servers = useAtomValue(savedServers)
  const lastOrg = useAtomValue(lastUsedOrg)

  return AsyncResult.matchWithError(AsyncResult.all([servers, lastOrg]), {
    onInitial: () => null,
    onError: () => <LoadFailed />,
    onDefect: () => <LoadFailed />,
    onSuccess: ({ value: [saved, last] }) => {
      if (saved.length === 0) return <Redirect href="/onboarding" />
      return Option.match(startLocation(saved, last), {
        onNone: () => (
          <Redirect
            href={{
              pathname: "/sign-in",
              params: { instanceId: saved[0].instanceId }
            }}
          />
        ),
        onSome: (location) => (
          <Redirect
            href={{
              pathname: "/orgs/[instanceId]/[orgSlug]",
              params: location
            }}
          />
        )
      })
    }
  })
}
