import { router } from "expo-router"

import { ConfirmScreen } from "@/onboarding/ConfirmScreen"

export default function AddServerConfirm() {
  return (
    <ConfirmScreen
      onSignedIn={() => router.replace("/")}
      onChangeServer={() => router.back()}
    />
  )
}
