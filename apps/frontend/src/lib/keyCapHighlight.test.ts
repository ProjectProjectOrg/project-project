import { expect, it } from "vitest"

import { installKeyCapHighlight } from "./keyCapHighlight"

it("lights the caps showing a key while it is held, and only those", () => {
  document.body.innerHTML =
    '<kbd data-key="shift"></kbd><kbd data-key="?"></kbd><kbd data-key="k"></kbd>'
  installKeyCapHighlight()
  const [shift, question, k] = document.querySelectorAll("kbd")
  const press = (type: string, key: string, code: string) =>
    document.dispatchEvent(new KeyboardEvent(type, { key, code }))

  press("keydown", "Shift", "ShiftLeft")
  press("keydown", "?", "Slash")
  expect(
    [shift, question, k].map((cap) => cap?.hasAttribute("data-pressed"))
  ).toEqual([true, true, false])

  press("keyup", "Shift", "ShiftLeft")
  press("keyup", "/", "Slash")
  expect(document.querySelectorAll("[data-pressed]")).toHaveLength(0)
})
