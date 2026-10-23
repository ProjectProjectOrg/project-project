import { describe, expect, it } from "vitest"

import { fitSlashMenu, placeSlashMenu } from "./slashMenuFit"

const full = 704
const list = 448

describe("fitSlashMenu", () => {
  it("keeps the wide menu at the caret when the column has room", () => {
    expect(
      fitSlashMenu({
        anchorLeft: 300,
        bounds: { left: 248, right: 1225 },
        full,
        list
      })
    ).toEqual({ preview: true, width: full, offset: 0 })
  })

  it("shifts left to stay inside the column, never over the sidebar", () => {
    const fit = fitSlashMenu({
      anchorLeft: 700,
      bounds: { left: 248, right: 1225 },
      full,
      list
    })
    expect(fit.preview).toBe(true)
    expect(700 + fit.offset).toBeGreaterThanOrEqual(256)
    expect(700 + fit.offset + fit.width).toBeLessThanOrEqual(1217)
  })

  it("shifts right when the caret sits left of the column", () => {
    const fit = fitSlashMenu({
      anchorLeft: 100,
      bounds: { left: 248, right: 1225 },
      full,
      list
    })
    expect(100 + fit.offset).toBe(256)
  })

  it("drops the preview pane when the column is narrower than the wide menu", () => {
    const fit = fitSlashMenu({
      anchorLeft: 400,
      bounds: { left: 248, right: 900 },
      full,
      list
    })
    expect(fit.preview).toBe(false)
    expect(fit.width).toBe(list)
    expect(400 + fit.offset).toBeGreaterThanOrEqual(256)
    expect(400 + fit.offset + fit.width).toBeLessThanOrEqual(892)
  })

  it("shrinks the list to the column on narrow screens", () => {
    const fit = fitSlashMenu({
      anchorLeft: 40,
      bounds: { left: 0, right: 360 },
      full,
      list
    })
    expect(fit).toEqual({ preview: false, width: 344, offset: -32 })
  })
})

describe("placeSlashMenu", () => {
  const bounds = { top: 56, bottom: 900 }
  const height = 416

  it("sits above the caret line when it fits", () => {
    expect(
      placeSlashMenu({ caret: { top: 600, bottom: 620 }, height, bounds })
    ).toEqual({ side: "above", top: 180 })
  })

  it("drops below the caret line when the top of the column is too close", () => {
    expect(
      placeSlashMenu({ caret: { top: 300, bottom: 320 }, height, bounds })
    ).toEqual({ side: "below", top: 324 })
  })

  it("stays below even when neither side fits", () => {
    expect(
      placeSlashMenu({ caret: { top: 100, bottom: 120 }, height: 2000, bounds })
        .side
    ).toBe("below")
  })
})
