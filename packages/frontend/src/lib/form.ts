import { createFormHook, useSelector } from "@tanstack/react-form"
import type { ReadonlyAtom } from "@tanstack/store"

/**
 * `form.state` is a snapshot, not a subscription: reading it during render
 * leaves the component frozen at whatever the values were when it last
 * rendered for some other reason. Field components subscribe for themselves —
 * anything outside them that has to follow the live values, rendered output or
 * effect alike, needs this.
 */
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
