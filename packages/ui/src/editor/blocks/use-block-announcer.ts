import type { BlockLookup } from "@pp/shared"
import type { LexicalNode } from "lexical"
import { useCallback, useState } from "react"

import { m } from "../messages"
import { blockChrome } from "./block-chrome"
import {
  $isTopLevelBlockNode,
  type BlockDirection,
  type TopLevelBlockNode
} from "./block-commands"

// What the gutter tells assistive tech: a polite live message per move,
// removal or change, naming the block (and its neighbour).

type Announcement = Readonly<{ id: number; text: string }>

function useAnnouncer() {
  const [announcement, setAnnouncement] = useState<Announcement>({
    id: 0,
    text: ""
  })
  const announce = useCallback(
    (text: string) =>
      setAnnouncement((current) => ({ id: current.id + 1, text })),
    []
  )
  return { announcement, announce }
}

export function useBlockAnnouncer(lookup: BlockLookup) {
  const { announcement, announce } = useAnnouncer()

  const nameOf = useCallback(
    (node: LexicalNode | null): string | null =>
      $isTopLevelBlockNode(node)
        ? blockChrome(node.getBlockType(), lookup).name
        : null,
    [lookup]
  )

  const announceMoved = useCallback(
    (
      node: TopLevelBlockNode,
      neighbour: LexicalNode | null,
      direction: BlockDirection
    ) => {
      const name = nameOf(node) ?? ""
      if (neighbour === null) {
        announce(
          direction === "up"
            ? m.editor_block_announce_edge_top({ name })
            : m.editor_block_announce_edge_bottom({ name })
        )
        return
      }
      const target = nameOf(neighbour)
      if (target === null)
        announce(
          direction === "up"
            ? m.editor_block_announce_moved_up({ name })
            : m.editor_block_announce_moved_down({ name })
        )
      else
        announce(
          direction === "up"
            ? m.editor_block_announce_moved_above({ name, target })
            : m.editor_block_announce_moved_below({ name, target })
        )
    },
    [announce, nameOf]
  )

  return { announcement, announce, announceMoved }
}
