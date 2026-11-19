// @vitest-environment jsdom
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

it("keeps the first key of a sequence lit until the next key", () => {
  document.body.innerHTML =
    '<kbd data-key="g" data-sequence-start></kbd><kbd data-key="b"></kbd>'
  installKeyCapHighlight()
  const [g, b] = document.querySelectorAll("kbd")
  const press = (type: string, key: string, code: string) =>
    document.dispatchEvent(new KeyboardEvent(type, { key, code }))

  press("keydown", "g", "KeyG")
  press("keyup", "g", "KeyG")
  expect(g?.hasAttribute("data-pressed")).toBe(true)

  press("keydown", "b", "KeyB")
  expect([g, b].map((cap) => cap?.hasAttribute("data-pressed"))).toEqual([
    false,
    true
  ])
  press("keyup", "b", "KeyB")
})

it("leaves Backspace unlit while it deletes text, and lights it on an empty field", () => {
  document.body.innerHTML =
    '<input value="ab" /><kbd data-key="backspace"></kbd>'
  installKeyCapHighlight()
  const input = document.querySelector("input")
  const cap = document.querySelector("kbd")
  const press = (type: string) =>
    input?.dispatchEvent(
      new KeyboardEvent(type, {
        key: "Backspace",
        code: "Backspace",
        bubbles: true
      })
    )

  press("keydown")
  expect(cap?.hasAttribute("data-pressed")).toBe(false)
  press("keyup")

  if (input) input.value = ""
  press("keydown")
  expect(cap?.hasAttribute("data-pressed")).toBe(true)
  press("keyup")
})
