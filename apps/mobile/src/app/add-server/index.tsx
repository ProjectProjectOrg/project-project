import { router } from "expo-router"

import { AddressScreen } from "@/onboarding/AddressScreen"

export default function AddServer() {
  return <AddressScreen onChecked={() => router.push("/add-server/confirm")} />
}
