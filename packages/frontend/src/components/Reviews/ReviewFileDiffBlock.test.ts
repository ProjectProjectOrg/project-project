import { describe, expect, it } from "vitest"
import {
  buildPierreFileDiff,
  mapPierreSelectionToPendingComment
} from "./ReviewFileDiffBlock"
import type { ReviewFilePatch } from "@projectproject/shared"

const baseFile = {
  summary: {
    filename: "src/example.ts",
    previousFilename: null,
    status: "modified",
    additions: 1,
    deletions: 1,
    changes: 2,
    threadCount: 0,
    commentCount: 0,
    binary: false
  },
  patch: "@@ -1,3 +1,3 @@\n export const one = 1\n-export const two = 2\n+export const two = 22\n export const three = 3",
  tooLarge: false,
  htmlUrl: "https://github.com/acme/repo/pull/1/files#diff-1"
} satisfies ReviewFilePatch

describe("buildPierreFileDiff", () => {
  it("turns a GitHub file patch into Pierre diff metadata", () => {
    const diff = buildPierreFileDiff(baseFile)

    expect(diff?.name).toBe("src/example.ts")
    expect(diff?.type).toBe("change")
    expect(diff?.hunks).toHaveLength(1)
    expect(diff?.cacheKey).toContain("src/example.ts")
  })

  it("does not build metadata for binary or empty patches", () => {
    expect(
      buildPierreFileDiff({ ...baseFile, patch: null, tooLarge: false })
    ).toBeNull()
    expect(
      buildPierreFileDiff({
        ...baseFile,
        summary: { ...baseFile.summary, binary: true }
      })
    ).toBeNull()
    expect(buildPierreFileDiff({ ...baseFile, tooLarge: true })).toBeNull()
  })
})

describe("mapPierreSelectionToPendingComment", () => {
  it("maps a right-side Pierre selection to a GitHub pending comment", () => {
    expect(
      mapPierreSelectionToPendingComment("src/example.ts", {
        start: 12,
        end: 14,
        side: "additions",
        endSide: "additions"
      })
    ).toEqual({
      path: "src/example.ts",
      side: "right",
      line: 14,
      startLine: 12
    })
  })

  it("maps a left-side single-line selection without a start line", () => {
    expect(
      mapPierreSelectionToPendingComment("src/example.ts", {
        start: 7,
        end: 7,
        side: "deletions",
        endSide: "deletions"
      })
    ).toEqual({
      path: "src/example.ts",
      side: "left",
      line: 7
    })
  })
})
