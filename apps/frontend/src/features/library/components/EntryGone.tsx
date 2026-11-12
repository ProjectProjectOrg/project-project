import * as AsyncResult from "effect/reactivity/AsyncResult"

import {
  LibraryEditorSkeleton,
  LibraryEntryMissing
} from "./LibraryEditorChrome"

export function EntryGone({
  removal
}: Readonly<{
  removal: ReadonlyArray<AsyncResult.AsyncResult<unknown, unknown>>
}>) {
  const leaving = removal.some(
    (state) => state.waiting || AsyncResult.isSuccess(state)
  )
  return leaving ? <LibraryEditorSkeleton /> : <LibraryEntryMissing />
}
