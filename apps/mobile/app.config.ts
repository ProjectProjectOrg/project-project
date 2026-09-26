import type { ExpoConfig } from "expo/config"

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
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
    "expo-web-browser"
  ]
}

export default config
