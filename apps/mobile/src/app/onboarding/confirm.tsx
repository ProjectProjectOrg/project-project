import { router } from "expo-router"

import { ConfirmScreen } from "@/onboarding/ConfirmScreen"

export default function OnboardingConfirm() {
  return (
    <ConfirmScreen
      onSignedIn={() => router.replace("/")}
      onChangeServer={() => router.back()}
    />
  )
}
