import { createFormHook } from "@tanstack/react-form"

export const {
  useAppForm,
  useFormContext,
  appFormOptions,
  defineAppFieldGroup
} = createFormHook({
  fieldComponents: {},
  formComponents: {}
})
