import { FigmaAuthInvalid, FigmaError } from "@pp/shared"

import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

export function githubOAuthErrorMessage(
  error: string | undefined
): string | null {
  switch (error) {
    case undefined:
      return null
    case "account_already_linked_to_different_user":
      return m.profile_github_error_account_already_linked()
    case "access_denied":
      return m.profile_github_error_access_denied()
    case "email_doesn't_match":
      return m.profile_github_error_email_mismatch()
    case "email_not_found":
    case "unable_to_get_user_info":
      return m.profile_github_error_missing_profile()
    case "invalid_code":
    case "no_code":
    case "state_mismatch":
    case "please_restart_the_process":
      return m.profile_github_error_expired()
    default:
      return m.profile_github_error_generic()
  }
}

export function figmaOAuthErrorMessage(
  error: string | undefined
): string | null {
  switch (error) {
    case undefined:
      return null
    case "figma_oauth_callback_invalid":
      return errorMessage(new FigmaAuthInvalid({}))
    default:
      return errorMessage(new FigmaError({ reason: error }))
  }
}
