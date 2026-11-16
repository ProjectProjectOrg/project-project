import { LayoutDashboard, Plus, Search } from "@pp/ui/icons"
import { Kbd } from "@pp/ui/kbd"
import {
  SidebarRail,
  SidebarRailItem,
  SidebarRailSeparator
} from "@pp/ui/sidebar"
import { useState } from "react"

import { ProjectTile } from "./parts/project-tile"

const PROJECTS = [
  {
    slug: "atl",
    name: "Atlas Mobile App",
    icon: "🧭",
    tone: "oklch(0.7 0.16 350)"
  },
  {
    slug: "bil",
    name: "Billing Platform",
    icon: "💳",
    tone: "oklch(0.7 0.16 255)"
  },
  {
    slug: "web",
    name: "Marketing Site",
    icon: "📣",
    tone: "oklch(0.7 0.16 75)"
  },
  { slug: "hello", name: "Hello", icon: "🪐", tone: "oklch(0.7 0.16 135)" }
] as const

export default function Rail() {
  const [active, setActive] = useState<string>("atl")
  return (
    <div className="h-[22rem] rounded-[14px] bg-background">
      <SidebarRail
        label="Projects"
        bottom={
          <SidebarRailItem
            label="Search"
            tooltip={
              <span className="flex items-center gap-2">
                Search <Kbd size="sm">⌘K</Kbd>
              </span>
            }
          >
            <Search />
          </SidebarRailItem>
        }
      >
        <SidebarRailItem
          label="Dashboard"
          active={active === "dash"}
          onClick={() => setActive("dash")}
        >
          <LayoutDashboard />
        </SidebarRailItem>
        <SidebarRailSeparator />
        {PROJECTS.map((project) => (
          <SidebarRailItem
            key={project.slug}
            label={project.name}
            tone={project.tone}
            active={active === project.slug}
            onClick={() => setActive(project.slug)}
          >
            <ProjectTile icon={project.icon} color={project.tone} />
          </SidebarRailItem>
        ))}
        <SidebarRailItem label="New project">
          <Plus />
        </SidebarRailItem>
      </SidebarRail>
    </div>
  )
}
