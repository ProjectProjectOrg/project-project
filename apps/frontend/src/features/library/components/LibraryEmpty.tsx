import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@pp/ui/empty"

import { DitheredBlocks } from "./DitheredBlocks"

export function LibraryEmpty({
  caption,
  hint
}: Readonly<{ caption: string; hint?: string }>) {
  return (
    <Empty intensity="subtle" className="min-h-[220px]">
      <EmptyMedia className="mb-1">
        <DitheredBlocks size={88} />
      </EmptyMedia>
      <EmptyTitle className="font-['Geist_Pixel'] text-title font-normal">
        {caption}
      </EmptyTitle>
      {hint === undefined ? null : (
        <EmptyDescription className="max-w-xs">{hint}</EmptyDescription>
      )}
    </Empty>
  )
}
