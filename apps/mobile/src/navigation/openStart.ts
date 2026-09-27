import * as Option from "effect/Option"
import { useNavigationContainerRef } from "expo-router"
import { useCallback } from "react"

import type { OrgLocation } from "@/servers/model"

export const useOpenStart = () => {
  const navigation = useNavigationContainerRef()
  return useCallback(
    (instanceId: string, start: Option.Option<OrgLocation>) =>
      navigation.reset({
        index: 0,
        routes: [
          Option.match(start, {
            onNone: () => ({ name: "no-orgs", params: { instanceId } }),
            onSome: (location) => ({
              name: "orgs/[instanceId]/[orgSlug]",
              params: location
            })
          })
        ]
      }),
    [navigation]
  )
}
