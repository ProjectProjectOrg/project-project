import { Config } from "@remotion/cli/config"
import { enableTailwind } from "@remotion/tailwind-v4"

const RAW = /raw/

const testsSvg = (test: unknown) =>
  test instanceof RegExp && test.test("logo.svg")

Config.overrideWebpackConfig((config) => {
  const tailwind = enableTailwind(config)
  // @pp/ui imports its logo as text (`logo.svg?raw`, as Vite reads it), so
  // a `?raw` import is the file's source and no other rule takes it.
  const rules = (tailwind.module?.rules ?? []).map((rule) =>
    rule !== null && typeof rule === "object" && testsSvg(rule.test)
      ? { ...rule, resourceQuery: { not: [RAW] } }
      : rule
  )
  return {
    ...tailwind,
    module: {
      ...tailwind.module,
      rules: [...rules, { resourceQuery: RAW, type: "asset/source" }]
    }
  }
})
// A clip can play a rendered clip (the What's new card plays the release's
// headline video), so the rendered videos are the public folder.
Config.setPublicDir("../../.changeset/media")
Config.setVideoImageFormat("jpeg")
Config.setCodec("h264")
Config.setCrf(28)
