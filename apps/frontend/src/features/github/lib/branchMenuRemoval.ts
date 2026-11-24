import * as Data from "effect/Data"

export type BranchMenuRemoval = Data.TaggedEnum<{
  ticket: {}
  stack: Readonly<{ busy: boolean; onRemove: () => void }>
}>
export const BranchMenuRemoval = Data.taggedEnum<BranchMenuRemoval>()
