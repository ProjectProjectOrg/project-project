import { RegistryProvider } from "@effect/atom-react"
import { SplashScreen, Stack } from "expo-router"
import * as SystemUI from "expo-system-ui"
import { useEffect } from "react"
import { SafeAreaListener } from "react-native-safe-area-context"
import { Uniwind, useCSSVariable } from "uniwind"

import { copy } from "@/copy"

import "../global.css"

const headerFont = { fontFamily: "Geist", fontWeight: "600" } as const

// The start screen redirects once the server store has loaded. Keeping the
// splash up until that first transition has finished means the app opens on
// its first real screen instead of sliding it in over a blank one.
void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [background, foreground] = useCSSVariable([
    "--color-background",
    "--color-foreground"
  ])
  // The window behind the screens shows through when a screen is swiped away
  // or a sheet is dragged, so it takes the theme background too.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(String(background))
  }, [background])
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
          screenListeners={{ transitionEnd: () => SplashScreen.hide() }}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: String(background) }
          }}
        >
          <Stack.Screen name="add-server" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="switch-org"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true
            }}
          />
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
