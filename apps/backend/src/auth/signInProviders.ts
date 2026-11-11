import type { SignInProvider } from "@pp/shared"

const configured: Readonly<Record<SignInProvider, boolean>> = {
  google: Boolean(process.env.GOOGLE_CLIENT_ID),
  microsoft: Boolean(process.env.MICROSOFT_CLIENT_ID)
}

export const isSignInProviderConfigured = (provider: SignInProvider) =>
  configured[provider]

export const signInProviders: ReadonlyArray<SignInProvider> = (
  ["google", "microsoft"] as const
).filter(isSignInProviderConfigured)
