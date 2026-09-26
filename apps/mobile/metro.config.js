const { getDefaultConfig } = require("expo/metro-config")
const { withUniwindConfig } = require("uniwind/metro")

const config = getDefaultConfig(__dirname)

config.transformer.babelTransformerPath =
  require.resolve("react-native-svg-transformer/expo")
config.resolver.assetExts = config.resolver.assetExts.filter(
  (extension) => extension !== "svg"
)
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"]

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts"
})
