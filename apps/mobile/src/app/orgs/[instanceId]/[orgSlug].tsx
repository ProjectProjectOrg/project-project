import { Host, Text } from "@expo/ui"
import { useLocalSearchParams } from "expo-router"

import { copy } from "@/copy"

export default function OrgHome() {
  const { orgSlug } = useLocalSearchParams<{
    instanceId: string
    orgSlug: string
  }>()
  return (
    <Host style={{ flex: 1 }}>
      <Text>{`${copy.orgHomeTitle}: ${orgSlug}`}</Text>
    </Host>
  )
}
