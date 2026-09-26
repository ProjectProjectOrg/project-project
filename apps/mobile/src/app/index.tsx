import { useAtomValue } from "@effect/atom-react"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Redirect } from "expo-router"

import { LoadFailed } from "@/components/LoadFailed"
import { lastUsedOrg, savedServers } from "@/servers/atoms"

export default function Index() {
  const servers = useAtomValue(savedServers)
  const lastOrg = useAtomValue(lastUsedOrg)

  return AsyncResult.matchWithError(AsyncResult.all([servers, lastOrg]), {
    onInitial: () => null,
    onError: () => <LoadFailed />,
    onDefect: () => <LoadFailed />,
    onSuccess: ({ value: [saved, last] }) => {
      if (saved.length === 0) return <Redirect href="/onboarding" />
      const location = Option.getOrElse(last, () => ({
        instanceId: saved[0].instanceId,
        orgSlug: saved[0].orgs[0]?.slug ?? ""
      }))
      return (
        <Redirect
          href={{
            pathname: "/orgs/[instanceId]/[orgSlug]",
            params: location
          }}
        />
      )
    }
  })
}
