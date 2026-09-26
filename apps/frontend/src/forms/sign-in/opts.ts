import { appFormOptions } from "@/lib/form"

export type SignInMethod = "link" | "code"

type SignInFormValues = Readonly<{
  email: string
  code: string
  method: SignInMethod
}>

const defaultValues: SignInFormValues = { email: "", code: "", method: "link" }

export const signInFormOpts = appFormOptions({ defaultValues })
