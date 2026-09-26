import { RegistryProvider } from "@effect/atom-react"
import { Stack } from "expo-router"
import { SafeAreaListener } from "react-native-safe-area-context"
import { Uniwind, useCSSVariable } from "uniwind"

import "../global.css"

export default function RootLayout() {
  const background = useCSSVariable("--color-background")
  return (
    <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
      <RegistryProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: String(background) }
          }}
        />
      </RegistryProvider>
    </SafeAreaListener>
  )
}
