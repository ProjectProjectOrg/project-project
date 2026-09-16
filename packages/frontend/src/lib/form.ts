import { createFormHook, useSelector } from "@tanstack/react-form"
import type { ReadonlyAtom } from "@tanstack/store"

export const useFormValues = <TValues>(form: {
  readonly atom: ReadonlyAtom<{ readonly values: TValues }>
}): TValues => useSelector(form.atom, (state) => state.values)

export const {
  useAppForm,
  useFormContext,
  appFormOptions,
  defineAppFieldGroup
} = createFormHook({
  fieldComponents: {},
  formComponents: {}
})
