import { fixtureEmail, fixturePath } from "./fixture"

const { auth } = await import("../../src/auth/config")
await auth.api.signInMagicLink({
  body: { email: fixtureEmail, callbackURL: fixturePath },
  headers: new Headers({ origin: process.env.BETTER_AUTH_URL! })
})
process.exit(0)
