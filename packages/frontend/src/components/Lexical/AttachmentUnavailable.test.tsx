import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import {
  ATTACHMENT_UNAVAILABLE_CHIP_HEIGHT,
  ATTACHMENT_UNAVAILABLE_CHIP_WIDTH,
  ATTACHMENT_UNAVAILABLE_HEIGHT,
  ATTACHMENT_UNAVAILABLE_WIDTH,
  AttachmentUnavailable
} from "./AttachmentUnavailable"

afterEach(cleanup)

describe("AttachmentUnavailable", () => {
  it("says the attachment could not be loaded", () => {
    render(<AttachmentUnavailable />)
    expect(
      screen.getByText("This attachment couldn't be loaded.")
    ).toBeDefined()
  })

  it("carries an explicit size, so the density morph has something to measure", () => {
    render(<AttachmentUnavailable />)
    const element = screen.getByText("This attachment couldn't be loaded.")
    expect(element.style.width).toBe(`${ATTACHMENT_UNAVAILABLE_WIDTH}px`)
    expect(element.style.height).toBe(`${ATTACHMENT_UNAVAILABLE_HEIGHT}px`)
  })

  it("fixes both dimensions when collapsed, so the morph never measures a moving target", () => {
    render(<AttachmentUnavailable variant="inline" />)
    const element = screen.getByText("This attachment couldn't be loaded.")
    expect(element.style.height).toBe(`${ATTACHMENT_UNAVAILABLE_CHIP_HEIGHT}px`)
    expect(element.style.width).toBe(`${ATTACHMENT_UNAVAILABLE_CHIP_WIDTH}px`)
  })
})
