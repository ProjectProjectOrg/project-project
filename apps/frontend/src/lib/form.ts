import {
  createFormHook,
  createValidator,
  useSelector
} from "@tanstack/react-form"
import type { ReadonlyAtom } from "@tanstack/store"

export const useFormValues = <TValues>(form: {
  readonly atom: ReadonlyAtom<{ readonly values: TValues }>
}): TValues => useSelector(form.atom, (state) => state.values)

const afterFirstSubmit = ({
  groupApi,
  formApi
}: Readonly<{
  groupApi?: Readonly<{ state: Readonly<{ submissionAttempts: number }> }>
  formApi: Readonly<{ state: Readonly<{ submissionAttempts: number }> }>
}>) =>
  (groupApi?.state.submissionAttempts ?? formApi.state.submissionAttempts) > 0

export const validateAfterSubmit = createValidator({
  triggers: [
    { trigger: "change", when: afterFirstSubmit },
    { trigger: "blur", when: afterFirstSubmit }
  ]
})

export const {
  useAppForm,
  useFormContext,
  appFormOptions,
  defineAppFieldGroup
} = createFormHook({
  fieldComponents: {},
  formComponents: {}
})
