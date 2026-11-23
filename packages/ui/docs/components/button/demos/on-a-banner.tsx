import { Button } from "@pp/ui/button"
import { ChevronDown, GitBranch, Settings } from "@pp/ui/icons"

import { MonetStrip } from "../../sidebar/demos/parts/monet-banner"

// A project page header over its banner: every fill is solid, worked out
// from the page, so the dithered image never shows through a button.
export default function OnABanner() {
  return (
    <div className="relative isolate flex h-40 w-full max-w-xl items-center overflow-hidden rounded-xl surface-page p-4">
      <MonetStrip banner="water_lily_pond" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={GitBranch}
          trailingIcon={ChevronDown}
        >
          ProjectProjectOrg/project-project
        </Button>
        <Button variant="tertiary" size="sm">
          Tertiary
        </Button>
        <Button variant="ghost" size="sm" data-force="hover">
          Ghost, hover
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          leadingIcon={Settings}
          aria-label="Settings"
        />
      </div>
    </div>
  )
}
