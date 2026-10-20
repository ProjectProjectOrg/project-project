import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { SettingsRow } from "@/components/settings/SettingsSection"
import { SettingsTextField } from "@/components/settings/SettingsTextField"

afterEach(cleanup)

const renderField = () => {
  const onCommit = vi.fn<(next: string) => void>()
  render(
    <SettingsRow label="Name">
      <SettingsTextField value="Acme" onCommit={onCommit} />
    </SettingsRow>
  )
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Name" })
  input.focus()
  fireEvent.change(input, { target: { value: "Acme Inc" } })
  return { input, onCommit }
}

it("Escape discards the edit instead of saving it", () => {
  const { input, onCommit } = renderField()
  fireEvent.keyDown(input, { key: "Escape" })
  expect(onCommit).not.toHaveBeenCalled()
  expect(input.value).toBe("Acme")
})

it("Enter saves the edit", () => {
  const { input, onCommit } = renderField()
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onCommit).toHaveBeenCalledWith("Acme Inc")
})
