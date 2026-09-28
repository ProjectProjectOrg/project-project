import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useLocalSearchParams } from "expo-router"
import { createContext, type ReactNode, useContext, useMemo } from "react"

import { savedServers } from "@/servers/atoms"
import type { OrgLocation } from "@/servers/model"

const OrgLocationContext = createContext<OrgLocation | null>(null)

export function OrgLocationProvider({
  children
}: Readonly<{ children: ReactNode }>) {
  const { instanceId, orgSlug } = useLocalSearchParams<{
    instanceId: string
    orgSlug: string
  }>()
  const location = useMemo(
    () => ({ instanceId, orgSlug }) satisfies OrgLocation,
    [instanceId, orgSlug]
  )
  return <OrgLocationContext value={location}>{children}</OrgLocationContext>
}

export const useOrgLocation = () => {
  const location = useContext(OrgLocationContext)
  if (location === null)
    throw new Error("useOrgLocation needs an OrgLocationProvider")
  return location
}

export const useOrgName = (location: OrgLocation) =>
  AsyncResult.getOrElse(
    AsyncResult.map(
      useAtomValue(savedServers),
      (saved) =>
        saved
          .find((server) => server.instanceId === location.instanceId)
          ?.orgs.find((org) => org.slug === location.orgSlug)?.name ??
        location.orgSlug
    ),
    () => location.orgSlug
  )
