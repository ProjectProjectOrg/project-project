import { createFormHook } from "@tanstack/react-form"
import { SteppedForm } from "@/components/form/stepped-form"
import { fieldContext, formContext } from "@/lib/form-context"

export const { withForm, useAppForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {},
  formComponents: {
    SteppedForm
  }
})
