import { Button } from "@pp/ui/button"
import { Dices } from "@pp/ui/icons"
import { projectTile } from "@pp/ui/lib/projectTile"
import { ProjectIcon } from "@pp/ui/project-icon"
import { useState } from "react"

import { COLORS, EMOJIS } from "./projects"

const seeds = (round: number) =>
  Array.from({ length: 16 }, (_, index) => `project-${round}-${index}`)

// Sixteen generated tiles. Each seed picks a pattern, a light and a texture;
// the colour and emoji cycle so every colour shows a few patterns.
export default function Explore() {
  const [round, setRound] = useState(0)
  return (
    <div className="@container grid w-full gap-6">
      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-x-4 gap-y-6 @xl:grid-cols-[repeat(8,minmax(0,1fr))]">
        {seeds(round).map((seed, index) => {
          const color = COLORS[index % COLORS.length]
          const { traits } = projectTile(seed, color)
          return (
            <div key={seed} className="grid min-w-0 justify-items-center gap-2">
              <ProjectIcon
                seed={seed}
                color={color}
                icon={EMOJIS[index % EMOJIS.length]}
                size={48}
              />
              <span className="text-center text-micro text-muted-foreground">
                {traits.join(", ")}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-center">
        <Button
          variant="secondary"
          size="sm"
          iconLeft
          onClick={() => setRound(round + 1)}
        >
          <Dices />
          New seeds
        </Button>
      </div>
    </div>
  )
}
