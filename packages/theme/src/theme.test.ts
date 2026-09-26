// @effect-diagnostics-next-line nodeBuiltinImport:off
import { readFileSync } from "node:fs"

import { expect, it } from "vitest"

const css = readFileSync(new URL("../theme.css", import.meta.url), "utf8")

const block = (opening: RegExp) => {
  const start = css.search(opening)
  const body = css.slice(start, css.indexOf("}", start))
  return new Set(
    Array.from(body.matchAll(/(--color-[\w-]+):/g), ([, name]) => name)
  )
}

it("gives every theme color a value in both light and dark", () => {
  const registered = block(/@theme \{/)
  const light = block(/@variant light \{/)
  const dark = block(/@variant dark \{/)
  expect(light).toEqual(registered)
  expect(dark).toEqual(registered)
})
