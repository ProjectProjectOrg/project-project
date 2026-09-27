import * as Option from "effect/Option"
import { router } from "expo-router"

import type { OrgLocation } from "@/servers/model"

export const openStart = (
  instanceId: string,
  start: Option.Option<OrgLocation>
) =>
  Option.match(start, {
    onNone: () =>
      router.replace({ pathname: "/no-orgs", params: { instanceId } }),
    onSome: (location) =>
      router.replace({
        pathname: "/orgs/[instanceId]/[orgSlug]",
        params: location
      })
  })
