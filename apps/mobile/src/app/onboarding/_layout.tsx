import { Stack } from "expo-router"

import { flowScreenOptions } from "@/onboarding/flowScreenOptions"

export default function OnboardingLayout() {
  return <Stack screenOptions={flowScreenOptions} />
}
