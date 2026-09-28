import { describe, expect, it } from "vitest"

import { toSignInFailed } from "./signIn"

describe("toSignInFailed", () => {
  it("maps Better Auth failures to what the user can do next", () => {
    expect(toSignInFailed({ status: 429 }).reason).toBe("rate_limited")
    expect(
      toSignInFailed({ status: 403, code: "TOO_MANY_ATTEMPTS" }).reason
    ).toBe("too_many_attempts")
    expect(toSignInFailed({ status: 400, code: "INVALID_OTP" }).reason).toBe(
      "invalid_code"
    )
    expect(toSignInFailed({ status: 400, code: "OTP_EXPIRED" }).reason).toBe(
      "invalid_code"
    )
    expect(toSignInFailed(new TypeError("Failed to fetch")).reason).toBe(
      "failed"
    )
  })
})
