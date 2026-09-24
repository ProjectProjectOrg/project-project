import { useAtomValue } from "@effect/atom-react"
import type { Library } from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { MotionConfig } from "motion/react"

import { LibraryContext } from "@/components/blocks/blockChrome"
import { ErrorPage } from "@/components/ErrorPage"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

import { BlockList } from "./BlockList"
import { BlockGalleryWell, TemplateGalleryWell } from "./GalleryWell"
import { libraryView, type LibraryScope } from "./libraryScope"
import { TemplateDefaultsRow } from "./TemplateDefaultsRow"
import { TemplateList } from "./TemplateList"

export type LibraryTab = "templates" | "blocks"

type LibraryPageProps = Readonly<{
  scope: LibraryScope
  tab: LibraryTab
  onTabChange: (tab: LibraryTab) => void
}>

export function LibraryPage({ scope, tab, onTabChange }: LibraryPageProps) {
  const result = useAtomValue(libraryView(scope))
  const items: ReadonlyArray<SegmentedItem<LibraryTab>> = [
    { key: "templates", label: m.templates_settings_tab_templates() },
    { key: "blocks", label: m.templates_settings_tab_blocks() }
  ]

  return (
    <div className="flex w-full flex-col gap-6">
      <SegmentedTabs
        className="self-start"
        items={items}
        isActive={(key) => key === tab}
        renderItem={(item, content, { active }) => (
          <button
            type="button"
            aria-pressed={active}
            onClick={() => onTabChange(item.key)}
            className={SEGMENTED_ITEM_CLASS(active)}
          >
            {content}
          </button>
        )}
      />
      {AsyncResult.matchWithError(result, {
        onInitial: () => <LibrarySkeleton />,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) => (
          <LibraryContext value={value}>
            <LibraryContent scope={scope} tab={tab} library={value} />
          </LibraryContext>
        )
      })}
    </div>
  )
}

function LibraryContent({
  scope,
  tab,
  library
}: Readonly<{ scope: LibraryScope; tab: LibraryTab; library: Library }>) {
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
        {tab === "blocks" ? (
          <>
            <BlockList scope={scope} library={library} />
            <BlockGalleryWell scope={scope} library={library} />
          </>
        ) : (
          <>
            <TemplateDefaultsRow scope={scope} library={library} />
            <TemplateList scope={scope} library={library} />
            <TemplateGalleryWell scope={scope} library={library} />
          </>
        )}
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
