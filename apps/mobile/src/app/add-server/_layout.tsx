import { Stack } from "expo-router"

import { flowScreenOptions } from "@/onboarding/flowScreenOptions"

export default function AddServerLayout() {
  return <Stack screenOptions={flowScreenOptions} />
}
