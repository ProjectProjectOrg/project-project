import { useAtomValue } from "@effect/atom-react"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Redirect } from "expo-router"

import { LoadFailed } from "@/components/LoadFailed"
import { lastUsedOrg, savedServers, signedInServers } from "@/servers/atoms"
import { startLocation } from "@/servers/startLocation"

export default function Index() {
  const servers = useAtomValue(savedServers)
  const lastOrg = useAtomValue(lastUsedOrg)
  const signedIn = useAtomValue(signedInServers)

  const start = AsyncResult.all([servers, lastOrg, signedIn])
  if (start.waiting) return null
  return AsyncResult.matchWithError(start, {
    onInitial: () => null,
    onError: () => <LoadFailed />,
    onDefect: () => <LoadFailed />,
    onSuccess: ({ value: [saved, last, signedInIds] }) => {
      if (saved.length === 0) return <Redirect href="/onboarding" />
      const signedIn = saved.filter((server) =>
        signedInIds.includes(server.instanceId)
      )
      return Option.match(startLocation(signedIn, last), {
        onSome: (location) => (
          <Redirect
            href={{
              pathname: "/orgs/[instanceId]/[orgSlug]",
              params: location
            }}
          />
        ),
        onNone: () =>
          signedIn.length > 0 ? (
            <Redirect
              href={{
                pathname: "/no-orgs",
                params: { instanceId: signedIn[0].instanceId }
              }}
            />
          ) : (
            <Redirect
              href={{
                pathname: "/sign-in",
                params: { instanceId: saved[0].instanceId }
              }}
            />
          )
      })
    }
  })
}
