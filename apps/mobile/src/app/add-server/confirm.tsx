import { router } from "expo-router"

import { ConfirmScreen } from "@/onboarding/ConfirmScreen"

export default function AddServerConfirm() {
  return (
    <ConfirmScreen
      onSaved={(instanceId) =>
        router.replace({ pathname: "/sign-in", params: { instanceId } })
      }
      onChangeServer={() => router.back()}
    />
  )
}
