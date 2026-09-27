import { router } from "expo-router"

import { useOpenStart } from "@/navigation/openStart"
import { ConfirmScreen } from "@/onboarding/ConfirmScreen"

export default function OnboardingConfirm() {
  const openStart = useOpenStart()
  return (
    <ConfirmScreen
      onSignedIn={openStart}
      onChangeServer={() => router.back()}
    />
  )
}
