import { act, cleanup, renderHook } from "@testing-library/react"
import * as Schema from "effect/Schema"
import { afterEach, expect, it } from "vitest"

import { useAppForm, useFormValues, validateAfterSubmit } from "./form"

afterEach(cleanup)

const defaults = { defaultValues: { crop: { zoom: 1 } } }

it("subscribes to field changes made outside a field component", () => {
  const { result } = renderHook(() => {
    const form = useAppForm(defaults)
    const values = useFormValues(form)
    return { form, values }
  })
  expect(result.current.values.crop.zoom).toBe(1)
  act(() => result.current.form.setFieldValue("crop.zoom", 2))
  expect(result.current.values.crop.zoom).toBe(2)
})

const requiredName = {
  defaultValues: { name: "" },
  validators: [
    validateAfterSubmit(
      Schema.toStandardSchemaV1(
        Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1)) })
      )
    )
  ]
}

it("validates on change only after the first submit attempt", async () => {
  const { result } = renderHook(() => useAppForm(requiredName))
  act(() => result.current.setFieldValue("name", "a"))
  act(() => result.current.setFieldValue("name", ""))
  expect(result.current.state.errors).toHaveLength(0)
  await act(() => result.current.handleSubmit())
  expect(result.current.state.errors).not.toHaveLength(0)
  await act(async () => result.current.setFieldValue("name", "named"))
  expect(result.current.state.errors).toHaveLength(0)
})
