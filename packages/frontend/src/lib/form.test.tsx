import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { useAppForm, useFormValues } from "./form"

afterEach(cleanup)

const defaults = { defaultValues: { crop: { zoom: 1 } } }

function Readout({ zoom, onZoomIn }: { zoom: number; onZoomIn: () => void }) {
  return (
    <>
      <span data-testid="zoom">{zoom}</span>
      <button type="button" onClick={onZoomIn}>
        zoom in
      </button>
    </>
  )
}

function Subscribed() {
  const form = useAppForm(defaults)
  const values = useFormValues(form)
  return (
    <Readout
      zoom={values.crop.zoom}
      onZoomIn={() => form.setFieldValue("crop.zoom", 2)}
    />
  )
}

function Snapshot() {
  const form = useAppForm(defaults)
  return (
    <Readout
      zoom={form.state.values.crop.zoom}
      onZoomIn={() => form.setFieldValue("crop.zoom", 2)}
    />
  )
}

const zoomIn = () => fireEvent.click(screen.getByRole("button"))

it("follows a field change made outside of a field component", () => {
  render(<Subscribed />)
  expect(screen.getByTestId("zoom").textContent).toBe("1")

  zoomIn()

  expect(screen.getByTestId("zoom").textContent).toBe("2")
})

it("proves form.state alone is a snapshot, not a subscription", () => {
  render(<Snapshot />)

  zoomIn()

  // The live banner preview and the step summaries hang off these values, so
  // reading form.state directly strands them on whatever the crop was when the
  // form last happened to render for some other reason.
  expect(screen.getByTestId("zoom").textContent).toBe("1")
})
