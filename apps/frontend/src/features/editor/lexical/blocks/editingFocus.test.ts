import { afterEach, describe, expect, it } from "vitest"

import { entersEditing, keepsEditing } from "./editingFocus"

afterEach(() => {
  document.body.replaceChildren()
})

function setup() {
  document.body.innerHTML = `
    <div id="host">
      <div id="editor" contenteditable="true"></div>
      <div data-block-gutter><button id="grip"></button></div>
    </div>
    <div data-block-menu><div id="item"></div></div>
    <button id="outside"></button>`
  const byId = (id: string) => document.getElementById(id)!
  return { host: byId("host"), byId }
}

describe("editing focus", () => {
  it("enters editing from the editor but not from the grip or the menu", () => {
    const { host, byId } = setup()
    expect(entersEditing(host, byId("editor"))).toBe(true)
    expect(entersEditing(host, byId("grip"))).toBe(false)
    expect(entersEditing(host, byId("item"))).toBe(false)
  })

  it("keeps editing while focus moves to the grip or the block menu", () => {
    const { host, byId } = setup()
    expect(keepsEditing(host, byId("grip"))).toBe(true)
    expect(keepsEditing(host, byId("item"))).toBe(true)
    expect(keepsEditing(host, byId("outside"))).toBe(false)
    expect(keepsEditing(host, null)).toBe(false)
  })
})
