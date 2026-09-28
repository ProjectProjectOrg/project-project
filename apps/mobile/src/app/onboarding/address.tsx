import { router } from "expo-router"

import { AddressScreen } from "@/onboarding/AddressScreen"

export default function OnboardingAddress() {
  return <AddressScreen onChecked={() => router.push("/onboarding/confirm")} />
}
