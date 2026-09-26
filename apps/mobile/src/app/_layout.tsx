import { RegistryProvider } from "@effect/atom-react"
import { Stack } from "expo-router"

export default function RootLayout() {
  return (
    <RegistryProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </RegistryProvider>
  )
}
