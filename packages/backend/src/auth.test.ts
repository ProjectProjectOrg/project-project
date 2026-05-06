import { describe, expect, it } from "vitest"
import { auth } from "./auth"

describe("Better Auth plugin wiring", () => {
  it("exposes the organization plugin endpoints", () => {
    expect(typeof auth.api.createOrganization).toBe("function")
    expect(typeof auth.api.listOrganizations).toBe("function")
    expect(typeof auth.api.createInvitation).toBe("function")
    expect(typeof auth.api.acceptInvitation).toBe("function")
    expect(typeof auth.api.setActiveOrganization).toBe("function")
  })

  it("exposes the admin plugin endpoints", () => {
    expect(typeof auth.api.listUsers).toBe("function")
    expect(typeof auth.api.setRole).toBe("function")
    expect(typeof auth.api.banUser).toBe("function")
    expect(typeof auth.api.impersonateUser).toBe("function")
  })
})
