import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { useState } from "react"
import * as Schema from "effect/Schema"
import { useAppForm } from "@/lib/form"
import { SteppedForm } from "./index"

afterEach(cleanup)

function Harness({
  step: initialStep = "source",
  busy = false
}: {
  step?: string
  busy?: boolean
}) {
  const [step, setStep] = useState(initialStep)
  const form = useAppForm({
    defaultValues: { source: { emoji: "" }, crop: { zoom: 1 } }
  })

  return (
    <form.AppForm>
      <SteppedForm
        form={form}
        step={step}
        onStepChange={setStep}
        busy={busy}
        labels={{ change: "Change", next: "Next", submit: "Apply" }}
        steps={[
          {
            id: "source",
            heading: "What is the icon?",
            summary: "Emoji",
            children: <p>source body</p>
          },
          {
            id: "crop",
            heading: "Which part of the photo?",
            summary: "Centred",
            children: <p>crop body</p>
          }
        ]}
      />
    </form.AppForm>
  )
}

const NonEmptyEmoji = Schema.toStandardSchemaV1(
  Schema.Struct({ emoji: Schema.NonEmptyString })
)

function ValidatedHarness({
  step: initialStep = "source",
  onSubmit
}: {
  step?: string
  onSubmit?: (emoji: string) => void
} = {}) {
  const [step, setStep] = useState(initialStep)
  const form = useAppForm({
    defaultValues: { source: { emoji: "" }, crop: { zoom: 1 } },
    onSubmit: ({ value }) => onSubmit?.(value.source.emoji)
  })

  return (
    <form.AppForm>
      <SteppedForm
        form={form}
        step={step}
        onStepChange={setStep}
        labels={{ change: "Change", next: "Next", submit: "Apply" }}
        steps={[
          {
            id: "source",
            heading: "What is the icon?",
            summary: "Emoji",
            validator: NonEmptyEmoji,
            children: (
              <form.Field name="source.emoji">
                {(field) => (
                  <input
                    aria-label="Emoji"
                    value={field.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                )}
              </form.Field>
            )
          },
          {
            id: "crop",
            heading: "Which part of the photo?",
            summary: "Centred",
            children: (
              <form.Field name="crop.zoom">
                {(field) => (
                  <>
                    <span>Zoom {field.value}</span>
                    <input
                      type="range"
                      aria-label="Zoom"
                      min={1}
                      max={4}
                      value={field.value}
                      onChange={(event) =>
                        field.handleChange(Number(event.target.value))
                      }
                    />
                  </>
                )}
              </form.Field>
            )
          }
        ]}
      />
    </form.AppForm>
  )
}

describe("SteppedForm", () => {
  it("renders the active step's body and collapses the rest to summaries", () => {
    const { getByText, queryByText } = render(<Harness step="source" />)

    expect(getByText("source body")).toBeTruthy()
    expect(queryByText("crop body")).toBeNull()
    expect(getByText("Centred")).toBeTruthy()
  })

  it("activates an earlier step when its Change button is pressed", () => {
    const { getAllByRole, getByText, queryByText } = render(
      <Harness step="crop" />
    )

    expect(getByText("crop body")).toBeTruthy()

    fireEvent.click(getAllByRole("button", { name: "Change" })[0])

    expect(getByText("source body")).toBeTruthy()
    expect(queryByText("crop body")).toBeNull()
  })

  it("keeps Next disabled until the active step's fields validate", async () => {
    const { getByRole } = render(<ValidatedHarness />)

    const next = getByRole("button", { name: "Next" })
    expect(next.hasAttribute("disabled")).toBe(true)

    fireEvent.change(getByRole("textbox", { name: "Emoji" }), {
      target: { value: "🎨" }
    })

    await waitFor(() => expect(next.hasAttribute("disabled")).toBe(false))
  })

  it("advances to the next step when Next is pressed", async () => {
    const { getByRole, getByText } = render(<ValidatedHarness />)

    fireEvent.change(getByRole("textbox", { name: "Emoji" }), {
      target: { value: "🎨" }
    })
    await waitFor(() =>
      expect(
        getByRole("button", { name: "Next" }).hasAttribute("disabled")
      ).toBe(false)
    )

    fireEvent.click(getByRole("button", { name: "Next" }))

    expect(getByText("Zoom 1")).toBeTruthy()
  })

  it("submits from the last step only once the whole form is valid", async () => {
    const submitted: Array<string> = []
    const { getByRole } = render(
      <ValidatedHarness
        step="crop"
        onSubmit={(emoji) => submitted.push(emoji)}
      />
    )

    const apply = getByRole("button", { name: "Apply" })
    expect(apply.hasAttribute("disabled")).toBe(true)

    fireEvent.click(getByRole("button", { name: "Change" }))
    fireEvent.change(getByRole("textbox", { name: "Emoji" }), {
      target: { value: "🎨" }
    })
    await waitFor(() =>
      expect(
        getByRole("button", { name: "Next" }).hasAttribute("disabled")
      ).toBe(false)
    )
    fireEvent.click(getByRole("button", { name: "Next" }))

    await waitFor(() =>
      expect(
        getByRole("button", { name: "Apply" }).hasAttribute("disabled")
      ).toBe(false)
    )
    fireEvent.click(getByRole("button", { name: "Apply" }))

    await waitFor(() => expect(submitted).toEqual(["🎨"]))
  })

  it("clears later steps when an earlier step's value changes", async () => {
    const { getByRole, getByText } = render(<ValidatedHarness step="crop" />)

    fireEvent.change(getByRole("slider", { name: "Zoom" }), {
      target: { value: "3" }
    })
    await waitFor(() => expect(getByText("Zoom 3")).toBeTruthy())

    fireEvent.click(getByRole("button", { name: "Change" }))
    fireEvent.change(getByRole("textbox", { name: "Emoji" }), {
      target: { value: "🎨" }
    })
    await waitFor(() =>
      expect(
        getByRole("button", { name: "Next" }).hasAttribute("disabled")
      ).toBe(false)
    )
    fireEvent.click(getByRole("button", { name: "Next" }))

    expect(getByText("Zoom 1")).toBeTruthy()
  })

  it("disables the fieldset while the mutation is in flight", () => {
    const { container } = render(<Harness busy />)

    const fieldset = container.querySelector("fieldset")

    expect(fieldset).toBeTruthy()
    expect(fieldset?.hasAttribute("disabled")).toBe(true)
  })
})
