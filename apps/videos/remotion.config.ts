import { Config } from "@remotion/cli/config"
import { enableTailwind } from "@remotion/tailwind-v4"

Config.overrideWebpackConfig((config) => enableTailwind(config))
Config.setVideoImageFormat("jpeg")
Config.setCodec("h264")
Config.setCrf(28)
