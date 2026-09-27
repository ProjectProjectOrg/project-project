import { RegistryProvider } from "@effect/atom-react"
import { Stack } from "expo-router"
import { SafeAreaListener } from "react-native-safe-area-context"
import { Uniwind, useCSSVariable } from "uniwind"

import { copy } from "@/copy"

import "../global.css"

const headerFont = { fontFamily: "Geist", fontWeight: "600" } as const

export default function RootLayout() {
  const [background, foreground] = useCSSVariable([
    "--color-background",
    "--color-foreground"
  ])
  const nativeHeader = {
    headerShown: true,
    headerTransparent: true,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
    headerTintColor: String(foreground),
    headerTitleStyle: headerFont,
    headerLargeTitleStyle: headerFont
  } as const
  return (
    <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
      <RegistryProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: String(background) }
          }}
        >
          <Stack.Screen name="add-server" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="settings/servers/index"
            options={{
              ...nativeHeader,
              title: copy.serversTitle,
              headerLargeTitle: true
            }}
          />
          <Stack.Screen
            name="settings/servers/[instanceId]"
            options={{ ...nativeHeader, title: "" }}
          />
        </Stack>
      </RegistryProvider>
    </SafeAreaListener>
  )
}
