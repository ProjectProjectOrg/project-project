import { AvatarSource, type AvatarOption } from "@pp/shared"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const GoogleIdTokenClaims = Schema.fromJsonString(
  Schema.Struct({ picture: Schema.optional(Schema.String) })
)

const decodeGoogleIdTokenClaims =
  Schema.decodeUnknownOption(GoogleIdTokenClaims)

export const googlePicture = (idToken: string | null) => {
  const payload = idToken?.split(".")[1]
  if (!payload) return null
  return decodeGoogleIdTokenClaims(
    Buffer.from(payload, "base64url").toString("utf8")
  ).pipe(
    Option.flatMapNullishOr((claims) => claims.picture),
    Option.getOrNull
  )
}

export const providerAvatar = (
  account: Readonly<{
    providerId: string
    accountId: string
    idToken: string | null
  }>
): AvatarOption | null => {
  switch (account.providerId) {
    case "github":
      return {
        source: "github" as const,
        image: `https://avatars.githubusercontent.com/u/${account.accountId}?v=4`
      }
    case "google": {
      const image = googlePicture(account.idToken)
      return image ? { source: "google" as const, image } : null
    }
    default:
      return null
  }
}

export const avatarOptions = (
  accounts: ReadonlyArray<Parameters<typeof providerAvatar>[0]>
): ReadonlyArray<AvatarOption> => {
  const fromProviders = accounts.flatMap(
    (account) => providerAvatar(account) ?? []
  )
  const unique = fromProviders.filter(
    (option, index) =>
      fromProviders.findIndex((o) => o.source === option.source) === index
  )
  return [{ source: "generated" as const, image: null }, ...unique].toSorted(
    (a, b) =>
      AvatarSource.literals.indexOf(a.source) -
      AvatarSource.literals.indexOf(b.source)
  )
}

export const effectiveAvatarSource = (
  stored: AvatarSource | null,
  image: string | null,
  options: ReadonlyArray<AvatarOption>
): AvatarSource | null =>
  options.find((option) => option.source === stored)?.source ??
  options.find((option) => option.image === image)?.source ??
  null
