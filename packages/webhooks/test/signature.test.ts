import { describe, expect, it } from "vitest"

import { generateSecret, signStandard } from "../src/signature"

describe("signStandard", () => {
  it("matches the Standard Webhooks reference vector", () => {
    expect(
      signStandard(
        "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
        "msg_p5jXN8AQM9LWM0D4loKWxJek",
        1614265330,
        '{"test": 2432232314}'
      )
    ).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=")
  })
})

describe("generateSecret", () => {
  it("is whsec_ followed by 32 base64 bytes", () => {
    const secret = generateSecret()
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]+=*$/u)
    expect(Buffer.from(secret.slice(6), "base64")).toHaveLength(32)
  })
})
