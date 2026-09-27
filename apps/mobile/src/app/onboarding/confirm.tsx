import { router } from "expo-router"

import { openStart } from "@/navigation/openStart"
import { ConfirmScreen } from "@/onboarding/ConfirmScreen"

export default function OnboardingConfirm() {
  return (
    <ConfirmScreen
      onSignedIn={openStart}
      onChangeServer={() => router.back()}
    />
  )
}
