import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { Button } from "@/components/ui/button"
import { AppearanceRow } from "./AppearanceCard"

afterEach(cleanup)

const row = (onActivate?: () => void) =>
  render(
    <AppearanceRow
      thumb={<span data-testid="thumb" />}
      label="Icon"
      detail="Custom image"
      action={
        <Button render={<span />} variant="tertiary" size="sm">
          Change
        </Button>
      }
      onActivate={onActivate}
    />
  )

it("opens the editor from anywhere in the row, not just the affordance", () => {
  const onActivate = vi.fn()
  row(onActivate)

  fireEvent.click(screen.getByText("Custom image"))
  expect(onActivate).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByText("Change"))
  expect(onActivate).toHaveBeenCalledTimes(2)
})

it("exposes the row as a single control rather than nesting one inside it", () => {
  row(vi.fn())

  expect(screen.getAllByRole("button")).toHaveLength(1)
  expect(screen.getByRole("button").textContent).toContain("Icon")
})

it("stays inert for a member who cannot edit", () => {
  row(undefined)

  expect(screen.queryByRole("button")).toBeNull()
})
