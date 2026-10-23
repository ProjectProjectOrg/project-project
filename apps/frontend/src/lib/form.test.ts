import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { useAppForm, useFormValues } from "./form"

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
