import logo from "@pp/ui/assets/logo/logo.svg"
import { ProjectIcon } from "@pp/ui/project-icon"
import type { ReactNode } from "react"

import { PROJECTS } from "./projects"

// Every size the app uses, from the settings sidebar's 14px row icon to the
// 48px page header.
const SIZES = [14, 16, 20, 28, 34, 40, 48] as const

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 justify-items-center gap-2">
      <div className="grid h-12 place-items-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

export default function Overview() {
  const [atlas, billing] = PROJECTS
  return (
    <div className="@container grid w-full gap-8">
      <div className="flex justify-center gap-10 py-2">
        {PROJECTS.slice(0, 4).map((project) => (
          <ProjectIcon
            key={project.id}
            seed={project.id}
            color={project.color}
            icon={project.icon}
            size={72}
            label={project.name}
          />
        ))}
      </div>
      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] justify-items-center gap-y-6 @xl:grid-cols-[repeat(7,minmax(0,1fr))]">
        {SIZES.map((size) => (
          <Cell key={size} caption={`${size}px`}>
            <ProjectIcon
              seed={atlas.id}
              color={atlas.color}
              icon={atlas.icon}
              size={size}
            />
          </Cell>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] justify-items-center gap-y-6">
        <Cell caption="Emoji">
          <ProjectIcon
            seed={billing.id}
            color={billing.color}
            icon={billing.icon}
            size={40}
          />
        </Cell>
        <Cell caption="Uploaded image">
          <ProjectIcon
            seed={billing.id}
            color={billing.color}
            size={40}
            image={
              // A transparent cutout, the usual upload: the generated backdrop
              // shows through, and the app's sticker shadow lifts it off. The
              // logo is drawn edge to edge, so it's inset to the emoji's size
              // (62% of the tile).
              <span className="grid size-full place-items-center p-[19%]">
                <img
                  src={logo}
                  alt=""
                  className="size-full object-contain [filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
                />
              </span>
            }
          />
        </Cell>
        <Cell caption="Saving">
          <ProjectIcon
            seed={billing.id}
            color={billing.color}
            icon={billing.icon}
            size={40}
            waiting
          />
        </Cell>
      </div>
    </div>
  )
}
