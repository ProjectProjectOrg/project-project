import { RegistryProvider } from "@effect/atom-react"
import {
  DarkTheme,
  DefaultTheme,
  SplashScreen,
  Stack,
  ThemeProvider
} from "expo-router"
import * as SystemUI from "expo-system-ui"
import { useEffect } from "react"
import { SafeAreaListener } from "react-native-safe-area-context"
import { Uniwind, useCSSVariable, useUniwind } from "uniwind"

import { copy } from "@/copy"

import "../global.css"

const headerFont = { fontFamily: "Geist", fontWeight: "600" } as const

// The start screen redirects once the server store has loaded. Keeping the
// splash up until that first transition has finished means the app opens on
// its first real screen instead of sliding it in over a blank one.
void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const { theme } = useUniwind()
  const [background, foreground, border] = useCSSVariable([
    "--color-background",
    "--color-foreground",
    "--color-border"
  ])
  // Every navigator, nested ones included, paints its screens and headers
  // from this theme, so they match the shared tokens in light and dark.
  const base = theme === "dark" ? DarkTheme : DefaultTheme
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: String(foreground),
      background: String(background),
      card: String(background),
      text: String(foreground),
      border: String(border)
    }
  }
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
        <ThemeProvider value={navigationTheme}>
          <Stack
            screenListeners={{ transitionEnd: () => SplashScreen.hide() }}
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: String(background) }
            }}
          >
            <Stack.Screen
              name="add-server"
              options={{ presentation: "modal" }}
            />
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
        </ThemeProvider>
      </RegistryProvider>
    </SafeAreaListener>
  )
}
