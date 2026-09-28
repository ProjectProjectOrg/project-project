import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import * as Atom from "effect/unstable/reactivity/Atom"

import { Api } from "@/api/Api"
import { authData } from "@/features/auth/atoms/auth"
import { authClient } from "@/services/AuthClient"

export type SignInFailureReason =
  | "rate_limited"
  | "too_many_attempts"
  | "invalid_code"
  | "failed"

export class SignInFailed extends Data.TaggedError("SignInFailed")<
  Readonly<{ reason: SignInFailureReason }>
> {}

const AuthFailure = Schema.Struct({
  status: Schema.optional(Schema.Finite),
  code: Schema.optional(Schema.String)
})

const decodeAuthFailure = Schema.decodeUnknownOption(AuthFailure)

const invalidCodes = new Set(["INVALID_OTP", "OTP_EXPIRED"])

const reasonFor = (cause: unknown): SignInFailureReason =>
  Option.match(decodeAuthFailure(cause), {
    onNone: () => "failed",
    onSome: (failure) => {
      if (failure.status === 429) return "rate_limited"
      if (failure.code === "TOO_MANY_ATTEMPTS") return "too_many_attempts"
      if (failure.code !== undefined && invalidCodes.has(failure.code)) {
        return "invalid_code"
      }
      return "failed"
    }
  })

export const toSignInFailed = (cause: unknown) =>
  new SignInFailed({ reason: reasonFor(cause) })

const Continuation = Schema.Struct({ url: Schema.String })

const decodeContinuation = Schema.decodeUnknownOption(Continuation)

const sessionRuntime = Atom.runtime(
  KeyValueStore.layerStorage(() => window.sessionStorage)
)

export const signInCodeSentTo = Atom.kvs({
  runtime: sessionRuntime,
  key: "pp:sign-in-code-sent-to",
  schema: Schema.NullOr(Schema.String),
  defaultValue: () => null
})

export type MagicLinkInput = Readonly<{ email: string; callbackURL: string }>

export type SignInWithCodeInput = Readonly<{ email: string; otp: string }>

export const sendMagicLink = Api.runtime.fn(
  Effect.fn("sendMagicLink")(function* (input: MagicLinkInput) {
    yield* Effect.tryPromise({
      try: () => authData(authClient.signIn.magicLink(input)),
      catch: toSignInFailed
    })
  })
)

export const sendSignInCode = Api.runtime.fn(
  Effect.fn("sendSignInCode")(function* (email: string) {
    yield* Effect.tryPromise({
      try: () =>
        authData(
          authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })
        ),
      catch: toSignInFailed
    })
    return email
  })
)

export const signInWithCode = Api.runtime.fn(
  Effect.fn("signInWithCode")(function* (input: SignInWithCodeInput) {
    const response = yield* Effect.tryPromise({
      try: () => authData(authClient.signIn.emailOtp(input)),
      catch: toSignInFailed
    })
    return Option.map(decodeContinuation(response), ({ url }) => url)
  })
)
