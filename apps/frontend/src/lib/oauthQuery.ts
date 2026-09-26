export const rawQueryFromSearch = (search: string): string =>
  search.startsWith("?") ? search.slice(1) : search

export const hasSignedOAuthQuery = (query: string): boolean =>
  new URLSearchParams(query).has("sig")

export const oauthAuthorizeUrl = (query: string): string =>
  `/api/auth/oauth2/authorize?${query}`

export const requiresFreshLogin = (query: string): boolean =>
  (new URLSearchParams(query).get("prompt") ?? "").split(" ").includes("login")
