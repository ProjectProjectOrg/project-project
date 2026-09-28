// Generates the native splash from @pp/theme into assets/splash/.
// Run with: bun run splash
//
// The splash is the first frame of the welcome screen: the logo on the dither
// ground, before the dither grows in. So it takes the same tokens the app
// draws with, converted to hex by culori like Uniwind does, and the welcome
// screen can take over from it without a visible change.
//
//   - logo-light.png, logo-dark.png  the logo in --color-foreground and
//                                    --color-muted-foreground, per scheme.
//   - colors.json                    --color-dither-back per scheme, read by
//                                    app.config.ts as the splash background.

// @effect-diagnostics-next-line nodeBuiltinImport:off
import { mkdir, readFile, writeFile } from "node:fs/promises"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { formatHex, parse } from "culori"
import sharp from "sharp"

const theme = fileURLToPath(new URL("../../../packages/theme", import.meta.url))
const out = fileURLToPath(new URL("../assets/splash", import.meta.url))

// The plugin scales this down to the splash's width at 1x, 2x and 3x.
const size = 1024

const tokens = (css: string, scheme: "light" | "dark") => {
  const start = css.search(new RegExp(`@variant ${scheme} \\{`))
  const body = css.slice(start, css.indexOf("}", start))
  return (name: string) => {
    const value = body.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1]
    const color = value === undefined ? undefined : parse(value)
    if (color === undefined)
      throw new Error(`--color-${name} has no ${scheme} color`)
    return formatHex(color)
  }
}

const css = await readFile(resolve(theme, "theme.css"), "utf8")
const logo = await readFile(resolve(theme, "brand/logo.svg"), "utf8")
const schemes = { light: tokens(css, "light"), dark: tokens(css, "dark") }

// The same recolouring as brand/.svgrrc.json, with the token values baked in.
const drawLogo = (scheme: keyof typeof schemes) => {
  const token = schemes[scheme]
  return sharp(
    Buffer.from(
      logo
        .replace(/fill="(#FEFEFE|white)"/gi, `fill="${token("foreground")}"`)
        .replace(/fill="#807F7F"/g, `fill="${token("muted-foreground")}"`)
    ),
    { density: 1200 }
  )
    .resize(size, size)
    .png()
    .toFile(resolve(out, `logo-${scheme}.png`))
}

await mkdir(out, { recursive: true })
await Promise.all([drawLogo("light"), drawLogo("dark")])
await writeFile(
  resolve(out, "colors.json"),
  `${JSON.stringify(
    {
      light: schemes.light("dither-back"),
      dark: schemes.dark("dither-back")
    },
    null,
    2
  )}\n`
)
