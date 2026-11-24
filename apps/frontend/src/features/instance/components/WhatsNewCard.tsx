import { useAtomValue } from "@effect/atom-react"
import { ItemLink } from "@pp/ui/item-link"
import { SidebarCard } from "@pp/ui/sidebar"
import { Link } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { instanceChangelog } from "../atoms/instance"
import { useWhatsNewSeen } from "../hooks/useWhatsNewSeen"
import { displayVersion } from "../lib/displayVersion"
import {
  changeCount,
  previewLines,
  topVideo,
  whatsNew,
  type WhatsNew
} from "../lib/whatsNew"
import { ChangelogVideo } from "./ChangelogVideo"

const releaseMeta = (version: string, date: string) =>
  Option.match(DateTime.make(date), {
    onNone: () => displayVersion(version),
    onSome: (at) =>
      `${displayVersion(version)} · ${DateTime.format(at, {
        locale: getLocale(),
        dateStyle: "medium"
      })}`
  })

export function WhatsNewCard() {
  const changelog = useAtomValue(instanceChangelog)
  const { lastSeen, markSeen: setLastSeen } = useWhatsNewSeen()
  const entries = AsyncResult.isSuccess(changelog)
    ? changelog.value.entries
    : []
  const notes = whatsNew(entries, lastSeen)
  const [shown, setShown] = useState<WhatsNew | null>(null)
  if (notes !== null && notes.version !== shown?.version) setShown(notes)
  const markSeen = () => {
    if (entries[0] !== undefined) setLastSeen(entries[0].version)
  }
  const video = shown === null ? null : topVideo(shown)

  return (
    <SidebarCard
      open={notes !== null}
      title={m.chrome_whats_new_title()}
      meta={shown === null ? undefined : releaseMeta(shown.version, shown.date)}
      media={
        video === null || shown === null ? undefined : (
          <ChangelogVideo video={video} label={previewLines(shown)[0] ?? ""} />
        )
      }
      link={
        <ItemLink
          render={<Link to="/changelog" />}
          aria-label={m.chrome_whats_new_full_changelog()}
        />
      }
      dismissLabel={m.chrome_whats_new_dismiss()}
      onDismiss={markSeen}
    >
      {shown === null ? null : <WhatsNewBody notes={shown} />}
    </SidebarCard>
  )
}

function WhatsNewBody({ notes }: Readonly<{ notes: WhatsNew }>) {
  const preview = previewLines(notes)
  const rest =
    notes.highlights.length > 0 ? 0 : changeCount(notes) - preview.length

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 text-caption text-foreground">
        {preview.map((line) => (
          <li key={line} className="text-pretty">
            {line}
          </li>
        ))}
      </ul>
      {rest > 0 ? (
        <p className="text-micro">{m.chrome_whats_new_more({ count: rest })}</p>
      ) : null}
      {/* The whole card is the link; this names where it goes. */}
      <span
        aria-hidden
        className="text-caption font-semibold text-foreground underline-offset-2 group-hover/sidebar-card:underline"
      >
        {m.chrome_whats_new_full_changelog()}
      </span>
    </div>
  )
}
