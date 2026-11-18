export const rawQueryFromSearch = (search: string) =>
  search.startsWith("?") ? search.slice(1) : search

export const hasSignedOAuthQuery = (query: string) =>
  new URLSearchParams(query).has("sig")

export const oauthAuthorizeUrl = (query: string) =>
  `/api/auth/oauth2/authorize?${query}`
