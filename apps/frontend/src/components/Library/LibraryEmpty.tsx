import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"

import { DitheredBlocks } from "./DitheredBlocks"

export function LibraryEmpty({
  caption,
  hint
}: Readonly<{ caption: string; hint?: string }>) {
  return (
    <Empty className="min-h-[220px]">
      <EmptyMedia className="mb-1">
        <DitheredBlocks size={88} />
      </EmptyMedia>
      <EmptyTitle className="font-['Geist_Pixel'] text-base font-normal">
        {caption}
      </EmptyTitle>
      {hint === undefined ? null : (
        <EmptyDescription className="max-w-xs text-xs">{hint}</EmptyDescription>
      )}
    </Empty>
  )
}
