import type { ExpoConfig } from "expo/config"

import splashColors from "./assets/splash/colors.json"

const config: ExpoConfig = {
  name: "ProjectProject",
  slug: "projectproject",
  scheme: "projectproject",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "nl.igne.projectproject",
    supportsTablet: true
  },
  android: {
    package: "nl.igne.projectproject"
  },
  experiments: {
    typedRoutes: true
  },
  plugins: [
    [
      "expo-font",
      {
        fonts: [
          "./node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
          "./node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf",
          "./node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf",
          "./node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf",
          "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf",
          "./node_modules/geist/dist/fonts/geist-mono/GeistMono-Medium.ttf"
        ]
      }
    ],
    "expo-router",
    "expo-secure-store",
    // The welcome screen grows out of this splash (bun run splash).
    [
      "expo-splash-screen",
      {
        image: "./assets/splash/logo-light.png",
        imageWidth: 96,
        backgroundColor: splashColors.light,
        dark: {
          image: "./assets/splash/logo-dark.png",
          backgroundColor: splashColors.dark
        }
      }
    ],
    "expo-sqlite",
    "expo-status-bar",
    "expo-web-browser"
  ]
}

export default config
