import { Button } from "@pp/ui/button"
import { DissolveAvatar } from "@pp/ui/dissolve-avatar"
import { Dices } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { orbAvatar } from "@pp/ui/lib/orbAvatar"
import { TextSwap } from "@pp/ui/text-swap"
import * as Effect from "effect/Effect"
import * as Random from "effect/Random"
import { useEffect, useId, useState, type ReactNode } from "react"

const FIRST = [
  "Ada",
  "Bram",
  "Céline",
  "Dev",
  "Esmée",
  "Farah",
  "Gijs",
  "Hana",
  "Ivo",
  "Juno",
  "Kofi",
  "Lotte",
  "Mateo",
  "Nia",
  "Otis",
  "Priya",
  "Quinn",
  "Rosa",
  "Sven",
  "Yuki"
] as const

const LAST = [
  "Achterberg",
  "Bakker",
  "Castillo",
  "de Wit",
  "Eze",
  "Fontaine",
  "Gupta",
  "Hoekstra",
  "Ishikawa",
  "Jansen",
  "Kowalski",
  "Lindqvist",
  "Moreau",
  "Nakamura",
  "Okafor",
  "Pereira",
  "van Rijn",
  "Sato",
  "Visser",
  "Zhou"
] as const

// A new name, never the one already showing.
const randomName = (current: string): string => {
  const next = Effect.runSync(
    Effect.all([Random.choice(FIRST), Random.choice(LAST)])
  ).join(" ")
  return next === current ? randomName(current) : next
}

function Format({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="grid h-12 place-items-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

// Type a name, or roll one: the orb is seeded by it, so every name gets its
// own, and each change dithers from the old avatar to the new one.
export default function Explore() {
  const [name, setName] = useState("Ada Visser")
  // The avatar follows the name once typing pauses (250ms), so it doesn't
  // regenerate and dissolve on every keystroke.
  const [settled, setSettled] = useState(name)
  useEffect(() => {
    if (name === settled) return undefined
    const controller = new AbortController()
    void Effect.runPromise(Effect.sleep("250 millis"), {
      signal: controller.signal
    })
      .then(() => setSettled(name))
      .catch(() => {})
    return () => controller.abort()
  }, [name, settled])
  const inputId = useId()
  const trimmed = settled.trim()
  const member = {
    id: `explore:${trimmed.toLowerCase() || "nobody"}`,
    name: trimmed === "" ? null : trimmed
  }
  const traits = orbAvatar(member.id).traits.join(" · ")

  return (
    <div className="@container grid w-full max-w-xl gap-8">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <label
            htmlFor={inputId}
            className="text-caption text-muted-foreground"
          >
            Name
          </label>
          <Input
            id={inputId}
            value={name}
            placeholder="Type a name"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          leadingIcon={Dices}
          onClick={() => {
            // A rolled name is one change, so it shows at once.
            const next = randomName(trimmed)
            setName(next)
            setSettled(next)
          }}
        >
          Random name
        </Button>
      </div>

      <div className="flex flex-col items-center gap-3">
        <DissolveAvatar
          member={member}
          size={96}
          label={trimmed === "" ? "No name" : trimmed}
        />
        <TextSwap className="text-caption text-muted-foreground">
          {traits}
        </TextSwap>
      </div>

      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] justify-items-center gap-y-6">
        {([48, 32, 24, 20, 16] as const).map((size) => (
          <Format key={size} caption={`${size}px`}>
            <DissolveAvatar member={member} size={size} />
          </Format>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] justify-items-center gap-6 @md:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Format caption="Next to a name">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-body">
            <DissolveAvatar member={member} size={20} />
            <span className="truncate">
              <TextSwap>{trimmed === "" ? "No name" : trimmed}</TextSwap>
            </span>
          </span>
        </Format>
        <Format caption="Comment header">
          <span className="inline-flex max-w-full items-center gap-2 text-body">
            <DissolveAvatar member={member} size={20} />
            <span className="truncate font-semibold">
              <TextSwap>{trimmed === "" ? "No name" : trimmed}</TextSwap>
            </span>
            <span className="text-caption text-muted-foreground">2h ago</span>
          </span>
        </Format>
      </div>
    </div>
  )
}
