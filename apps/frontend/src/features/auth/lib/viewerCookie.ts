import { viewerCookieName } from "@pp/shared"

export const signedInViewer = () => {
  const prefix = `${viewerCookieName}=`
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length)
  return value ? decodeURIComponent(value) : null
}
