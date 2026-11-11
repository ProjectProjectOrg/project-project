import * as Schema from "effect/Schema"

export const SignInProvider = Schema.Literals(["google", "microsoft"])
export type SignInProvider = typeof SignInProvider.Type
