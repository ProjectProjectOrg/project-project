import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MobileAppCard } from "./MobileAppCard"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("MobileAppCard", () => {
  it("shows the server address and copies it", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve()
    )
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    render(<MobileAppCard address="pp.igne.nl" />)

    expect(screen.queryByText("pp.igne.nl")).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("pp.igne.nl"))
  })
})
