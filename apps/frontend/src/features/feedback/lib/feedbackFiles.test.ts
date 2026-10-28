import { FEEDBACK_ATTACHMENT_MAX_BYTES } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { acceptFiles, formatFileSize } from "./feedbackFiles"

const png = (name: string, size = 1000) => ({ name, type: "image/png", size })

describe("acceptFiles", () => {
  it("accepts supported files within the limits", () => {
    const result = acceptFiles(0, [png("a.png"), png("b.png")])
    expect(result.accepted).toHaveLength(2)
    expect(result.rejection).toBeNull()
  })

  it("keeps only as many files as there is room for", () => {
    const result = acceptFiles(4, [png("a.png"), png("b.png")])
    expect(result.accepted.map((file) => file.name)).toEqual(["a.png"])
    expect(result.rejection).toBe("too_many")
  })

  it("rejects oversized and unsupported files", () => {
    expect(
      acceptFiles(0, [png("big.png", FEEDBACK_ATTACHMENT_MAX_BYTES + 1)])
        .rejection
    ).toBe("too_large")
    const exe = { name: "run.exe", type: "application/x-msdownload", size: 10 }
    expect(acceptFiles(0, [exe, png("a.png")])).toEqual({
      accepted: [png("a.png")],
      rejection: "unsupported"
    })
  })
})

describe("formatFileSize", () => {
  it("uses KB below a megabyte and MB above", () => {
    expect(formatFileSize(500)).toBe("1 KB")
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB")
  })
})
