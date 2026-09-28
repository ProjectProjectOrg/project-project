import { useCSSVariable } from "uniwind"

export const headerFont = { fontFamily: "Geist", fontWeight: "600" } as const

export const useNativeHeader = () => {
  const foreground = String(useCSSVariable("--color-foreground"))
  return {
    headerShown: true,
    headerTransparent: true,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
    headerTintColor: foreground,
    headerTitleStyle: headerFont,
    headerLargeTitleStyle: headerFont
  } as const
}
