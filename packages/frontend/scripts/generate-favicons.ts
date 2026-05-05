// Generates the favicon set from src/public/logo/logo.svg into src/public/icon/.
// Run with: bun run favicons
//
// What this produces (and why):
//   - favicon.svg          theme-aware SVG — uses prefers-color-scheme inside
//                          the SVG so browsers that support SVG favicons get a
//                          mark that flips with the OS theme.
//   - favicon.ico          legacy fallback, multi-size (16/32/48) bundle.
//   - apple-touch-icon.png 180×180, iOS home screen.
//   - icon-192.png         PWA / Android home screen.
//   - icon-512.png         PWA / Android home screen.
//   - site.webmanifest     manifest pointing at the PWA icons.
//
// All raster icons are rendered onto a dark rounded-square backdrop so the
// mark stays legible on both light and dark browser chrome (favicons can't
// pick up the page theme — they live in the OS shell).

import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import sharp from "sharp"
import pngToIco from "png-to-ico"

const ROOT = resolve(import.meta.dir, "..")
const LOGO_PATH = resolve(ROOT, "src/public/logo/logo.svg")
const OUT_DIR = resolve(ROOT, "src/public/icon")

// Backdrop color = oklch(0.145 0 0), the light-mode --foreground from styles.css.
// We hard-code the sRGB hex here because favicons render outside our CSS.
const BACKDROP = "#252525"
const RADIUS_PCT = 0.2 // rounded-square corners, 20% of the canvas
const PADDING_PCT = 0.15 // logo occupies the inner 70% of the canvas

async function main() {
  const logoSvg = await readFile(LOGO_PATH, "utf8")

  // Pull viewBox so we can correctly scale the inner <g> into the icon canvas.
  const viewBoxMatch = logoSvg.match(/viewBox="([\d.\s-]+)"/)
  if (!viewBoxMatch) throw new Error("source logo svg has no viewBox")
  const [, , vbW, vbH] = viewBoxMatch[1].split(/\s+/).map(Number)

  // Inner SVG without its outer <svg> wrapper — we'll re-wrap it inside the
  // backdropped icon canvas.
  const innerLogo = logoSvg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")

  // Build a master 512×512 icon SVG: rounded backdrop + centered logo.
  function buildIconSvg(canvas = 512) {
    const inner = canvas * (1 - 2 * PADDING_PCT)
    const scale = Math.min(inner / vbW, inner / vbH)
    const drawW = vbW * scale
    const drawH = vbH * scale
    const offsetX = (canvas - drawW) / 2
    const offsetY = (canvas - drawH) / 2
    const radius = canvas * RADIUS_PCT
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <rect width="${canvas}" height="${canvas}" rx="${radius}" ry="${radius}" fill="${BACKDROP}" />
  <g transform="translate(${offsetX} ${offsetY}) scale(${scale})">${innerLogo}</g>
</svg>`
  }

  const masterSvg = buildIconSvg(512)

  // Rasterize the master icon to each target size.
  async function renderPng(size: number) {
    return await sharp(Buffer.from(masterSvg))
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  }

  const sizes = [16, 32, 48, 180, 192, 512] as const
  const pngs = Object.fromEntries(
    await Promise.all(sizes.map(async (s) => [s, await renderPng(s)] as const))
  ) as Record<(typeof sizes)[number], Buffer>

  await writeFile(resolve(OUT_DIR, "apple-touch-icon.png"), pngs[180])
  await writeFile(resolve(OUT_DIR, "icon-192.png"), pngs[192])
  await writeFile(resolve(OUT_DIR, "icon-512.png"), pngs[512])

  // ICO bundles 16/32/48 so OSes can pick the best size.
  const ico = await pngToIco([pngs[16], pngs[32], pngs[48]])
  await writeFile(resolve(OUT_DIR, "favicon.ico"), ico)

  // Theme-aware SVG favicon. We inject a <style> block that rewrites the two
  // baked source colors based on prefers-color-scheme, so browsers that
  // support SVG favicons get a mark that follows the OS theme.
  //
  // Source colors come from logo.svg: #FEFEFE (primary), #807F7F (muted).
  const themedFaviconSvg = logoSvg.replace(
    /<svg([^>]*)>/,
    `<svg$1>
  <style>
    [fill="#FEFEFE"] { fill: #252525; }
    [fill="#807F7F"] { fill: #757575; }
    @media (prefers-color-scheme: dark) {
      [fill="#FEFEFE"] { fill: #fafafa; }
      [fill="#807F7F"] { fill: #a8a8a8; }
    }
  </style>`
  )
  await writeFile(resolve(OUT_DIR, "favicon.svg"), themedFaviconSvg)

  // Minimal PWA manifest pointing at the two large icons.
  const manifest = {
    name: "ProjectProject",
    short_name: "ProjectProject",
    icons: [
      { src: "/icon/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    theme_color: "#252525",
    background_color: "#ffffff",
    display: "standalone"
  }
  await writeFile(
    resolve(OUT_DIR, "site.webmanifest"),
    JSON.stringify(manifest, null, 2) + "\n"
  )

  console.log("✓ wrote favicon set to", OUT_DIR)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
