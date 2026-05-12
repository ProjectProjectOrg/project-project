import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"

export interface SubmitConsentInput {
  readonly accept: boolean
  readonly consentCode: string
}

export const submitConsentAtom = Atom.family((consentCode: string) =>
  runtime.fn(
    Effect.fn(function* (input: SubmitConsentInput) {
      const client = yield* ApiClient
      return yield* client.oauthApplications.consent({
        payload: {
          accept: input.accept,
          consent_code: consentCode
        }
      })
    })
  )
)
