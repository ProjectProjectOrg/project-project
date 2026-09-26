import { useLocalSearchParams } from "expo-router"

import { Placeholder } from "@/components/Placeholder"
import { copy } from "@/copy"

export default function OrgHome() {
  const { orgSlug } = useLocalSearchParams<{
    instanceId: string
    orgSlug: string
  }>()
  return <Placeholder title={`${copy.orgHomeTitle}: ${orgSlug}`} />
}
