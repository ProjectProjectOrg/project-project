import { useAtomValue } from "@effect/atom-react"
import type { Library } from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { MotionConfig } from "motion/react"

import { LibraryContext } from "@/components/blocks/blockChrome"
import { ErrorPage } from "@/components/ErrorPage"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

import { BlockList } from "./BlockList"
import { BlockGalleryWell } from "./GalleryWell"
import { libraryView, type LibraryScope } from "./libraryScope"

type LibraryPageProps = Readonly<{ scope: LibraryScope }>

export function LibraryPage({ scope }: LibraryPageProps) {
  const result = useAtomValue(libraryView(scope))

  return (
    <div className="flex w-full flex-col gap-6">
      {AsyncResult.matchWithError(result, {
        onInitial: () => <LibrarySkeleton />,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) => (
          <LibraryContext value={value}>
            <LibraryContent scope={scope} library={value} />
          </LibraryContext>
        )
      })}
    </div>
  )
}

function LibraryContent({
  scope,
  library
}: Readonly<{ scope: LibraryScope; library: Library }>) {
  // One transition for every layout animation on the page, so tiles, cards
  // and their contents move together, and no motion for users who ask.
  return (
    <MotionConfig transition={transitions.layout} reducedMotion="user">
      <div className="flex flex-col gap-10">
        {library.canEdit ? null : (
          <p className="text-xs text-muted-foreground">
            {m.templates_settings_read_only()}
          </p>
        )}
        <BlockList scope={scope} library={library} />
        <BlockGalleryWell scope={scope} library={library} />
      </div>
    </MotionConfig>
  )
}

function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  )
}
