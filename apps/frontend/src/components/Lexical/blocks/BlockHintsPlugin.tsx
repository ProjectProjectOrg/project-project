import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { Library } from "@pp/shared"
import { useEffect, useMemo } from "react"

import { lookupFor } from "@/components/blocks/blockChrome"

import { registerBlockHints } from "./blockHints"

export function BlockHintsPlugin({ library }: Readonly<{ library: Library }>) {
  const [editor] = useLexicalComposerContext()
  const lookup = useMemo(() => lookupFor(library), [library])

  useEffect(() => registerBlockHints(editor, lookup), [editor, lookup])

  return null
}
