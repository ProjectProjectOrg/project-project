// @effect-diagnostics-next-line nodeBuiltinImport:off
import { writeFileSync } from "node:fs"

import type { ExpoConfig } from "expo/config"
import {
  type ConfigPlugin,
  IOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject
} from "expo/config-plugins"

const sceneDelegateSource = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {}
`

const windowStartup =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/

const adoptScenes = (appDelegate: string) =>
  appDelegate
    .replace(
      /class AppDelegate: ExpoAppDelegate \{/,
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {"
    )
    .replace(windowStartup, "\n")

const withSceneLifecycle: ConfigPlugin = (config) => {
  const withManifest = withInfoPlist(config, (plist) => {
    plist.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate"
          }
        ]
      }
    }
    return plist
  })

  const withDelegate = withAppDelegate(withManifest, (delegate) => {
    delegate.modResults.contents = adoptScenes(delegate.modResults.contents)
    return delegate
  })

  return withXcodeProject(withDelegate, (xcode) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      xcode.modRequest.projectRoot
    )
    const filepath = `${projectName}/SceneDelegate.swift`
    writeFileSync(
      `${xcode.modRequest.platformProjectRoot}/${filepath}`,
      sceneDelegateSource
    )
    if (!xcode.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: xcode.modResults
      })
    }
    return xcode
  })
}

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

export default withSceneLifecycle(config)
