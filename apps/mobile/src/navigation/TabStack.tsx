import { router, Stack } from "expo-router"

import { copy } from "@/copy"
import { useOrgLocation, useOrgName } from "@/orgs/location"

import { headerFont, useNativeHeader } from "./nativeHeader"

export function TabStack() {
  const header = useNativeHeader()
  const name = useOrgName(useOrgLocation())
  return (
    <Stack
      screenOptions={{
        ...header,
        headerLargeTitle: true,
        unstable_headerLeftItems: () => [
          {
            type: "button",
            label: name,
            labelStyle: headerFont,
            accessibilityLabel: copy.switchOrgLabel(name),
            onPress: () => router.push("/switch-org")
          }
        ],
        unstable_headerRightItems: () => [
          {
            type: "button",
            label: copy.serversTitle,
            icon: { type: "sfSymbol", name: "gearshape" },
            onPress: () => router.push("/settings/servers")
          }
        ]
      }}
    />
  )
}
