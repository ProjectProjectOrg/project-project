import { viewerCookieName } from "@pp/shared"
import { createAuthMiddleware } from "better-auth/api"
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies"

export const mirrorViewerCookie = createAuthMiddleware(async (ctx) => {
  const written = parseSetCookieHeader(
    ctx.context.responseHeaders?.get("set-cookie") ?? ""
  ).get(ctx.context.authCookies.sessionToken.name)
  if (written === undefined) return
  const viewer =
    written["max-age"] === 0
      ? undefined
      : (ctx.context.newSession ?? ctx.context.session)?.user.id
  const options = { ...toCookieOptions(written), httpOnly: false }
  ctx.setCookie(
    viewerCookieName,
    viewer ?? "",
    viewer === undefined ? { ...options, maxAge: 0 } : options
  )
})
