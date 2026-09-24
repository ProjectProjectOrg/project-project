import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { CreatorChip } from "./CreatorChip"

afterEach(cleanup)

it("scales down on press while keeping the expand transition", () => {
  render(
    <CreatorChip
      expanded={false}
      tone="muted"
      icon={null}
      label="Type"
      contentKey="type"
    />
  )
  const chip = screen.getByRole("button")
  expect(chip.classList.contains("active:scale-[0.97]")).toBe(true)
  expect(chip.classList.contains("transition-expand")).toBe(true)
})
