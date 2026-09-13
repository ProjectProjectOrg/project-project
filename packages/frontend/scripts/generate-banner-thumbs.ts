import { readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/components")
const THUMB_WIDTH = 480

const sources = (await readdir(dir)).filter(
  (name) =>
    name.startsWith("project-banner-monet-") && !name.includes("-thumb.")
)

for (const name of sources) {
  const out = `${name.replace(/\.(jpg|png)$/, "")}-thumb.webp`
  await sharp(join(dir, name))
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(join(dir, out))
  console.log(out)
}
