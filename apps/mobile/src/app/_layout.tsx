import { RegistryProvider } from "@effect/atom-react"
import {
  DarkTheme,
  DefaultTheme,
  SplashScreen,
  Stack,
  ThemeProvider
} from "expo-router"
import * as SystemUI from "expo-system-ui"
import { useEffect, useState } from "react"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import {
  initialWindowMetrics,
  SafeAreaListener
} from "react-native-safe-area-context"
import { Uniwind, useCSSVariable, useUniwind } from "uniwind"

import { copy } from "@/copy"

import "../global.css"

const headerFont = { fontFamily: "Geist", fontWeight: "600" } as const

// The start screen redirects once the server store has loaded. Until the
// screen it redirects to has appeared, the root stack doesn't animate and
// the splash stays up, so the app opens on its first real screen instead of
// sliding it in over a blank one. Dev builds replace the splash with the dev
// client's loading screen, so the animation is what keeps the start steady
// there.
void SplashScreen.preventAutoHideAsync()

// Uniwind's safe-area classes start at zero insets until the listener below
// reports them, so a screen that renders first would shift down a frame
// later. The window's insets are known before the first render, so they're
// given to Uniwind straight away.
if (initialWindowMetrics !== null)
  Uniwind.updateInsets(initialWindowMetrics.insets)

export default function RootLayout() {
  const [started, setStarted] = useState(false)
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
        <RegistryProvider>
          <ThemeProvider value={navigationTheme}>
            <Stack
              screenListeners={({ route }) => ({
                // After the transition, not on focus: focus fires before the
                // native transition starts, so flipping then would animate it.
                transitionEnd: () => {
                  if (route.name === "index") return
                  setStarted(true)
                  // The welcome screen grows out of the splash, so it hides
                  // the splash itself once its first frame matches it.
                  if (route.name !== "onboarding") SplashScreen.hide()
                }
              })}
              screenOptions={{
                headerShown: false,
                animation: started ? "default" : "none",
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
    </GestureHandlerRootView>
  )
}
