import { m } from "@/paraglide/messages"

export function signInOAuthErrorMessage(
  error: string | undefined
): string | null {
  switch (error) {
    case undefined:
      return null
    case "account_not_linked":
      return m.auth_sign_in_error_account_not_linked()
    case "access_denied":
      return m.auth_sign_in_error_cancelled()
    default:
      return m.auth_sign_in_error()
  }
}

export function signInErrorCallbackURL(search: string): string {
  const params = new URLSearchParams(search)
  params.delete("error")
  params.delete("error_description")
  const query = params.toString()
  return query ? `/login?${query}` : "/login"
}
