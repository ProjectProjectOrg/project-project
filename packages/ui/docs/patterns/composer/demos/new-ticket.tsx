import { Button } from "@pp/ui/button"
import { commandMenuPanelClass } from "@pp/ui/command-menu"
import { Composer } from "@pp/ui/composer"
import {
  ChevronDown,
  CircleDashed,
  Plus,
  Signal,
  UserRound
} from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { ProjectIcon } from "@pp/ui/project-icon"
import { Select, SelectTrigger } from "@pp/ui/select"
import { TextSwap } from "@pp/ui/text-swap"
import { useState } from "react"

const PROJECTS = [
  {
    slug: "atlas-mobile-app",
    name: "Atlas Mobile App",
    icon: "🧭",
    color: "#e271b5"
  },
  {
    slug: "billing-platform",
    name: "Billing Platform",
    icon: "💳",
    color: "#8a8f98"
  },
  {
    slug: "marketing-site",
    name: "Marketing Site",
    icon: "📣",
    color: "#e05d44"
  },
  { slug: "design-system", name: "Design System", icon: "🎨", color: "#c2410c" }
] as const

type Project = (typeof PROJECTS)[number]

function Tile({ project }: Readonly<{ project: Project }>) {
  return (
    <ProjectIcon
      seed={project.slug}
      color={project.color}
      icon={project.icon}
      size={16}
    />
  )
}

// cmd+k › New ticket (CreateTicketPage → CreateTicketForm in the command
// menu): the project picker and "New ticket" on the header line, inside the
// cmd+k panel. LexicalEditor is app-only; a textarea stands in with the
// editor's content classes.
export default function NewTicket() {
  const [slug, setSlug] = useState<Project["slug"]>(PROJECTS[0].slug)
  const [title, setTitle] = useState("")
  const project = PROJECTS.find((entry) => entry.slug === slug) ?? PROJECTS[0]
  return (
    <div className="flex w-full items-start justify-center">
      <div className={commandMenuPanelClass}>
        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <Composer.Header>
            <Select
              items={PROJECTS.map((entry) => ({
                value: entry.slug,
                textValue: entry.name,
                label: (
                  <span className="flex min-w-0 items-center gap-2">
                    <Tile project={entry} />
                    <span className="truncate">{entry.name}</span>
                  </span>
                )
              }))}
              value={slug}
              onValueChange={setSlug}
              contentProps={{ align: "start", className: "w-56" }}
            >
              <SelectTrigger
                aria-label={`Project: ${project.name}. Click to change.`}
                render={<Button type="button" variant="ghost" tone="strong" />}
              >
                <TextSwap
                  className="gap-1.5"
                  iconKey={project.slug}
                  icon={<Tile project={project} />}
                >
                  {project.name}
                </TextSwap>
                <ChevronDown className="size-3" strokeWidth={1.75} />
              </SelectTrigger>
            </Select>
            <h2 className="text-body font-normal text-muted-foreground">
              New ticket
            </h2>
          </Composer.Header>
          <Composer.Title>
            <Input
              variant="bare"
              aria-label="Ticket title"
              aria-required
              placeholder="Ticket title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Composer.Title>
          <Composer.Body>
            <div className="prose-md">
              <textarea
                aria-label="Add a description…"
                placeholder="Add a description…"
                className="lexical-content block min-h-[8rem] w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Composer.Body>
          <Composer.Tray>
            <Composer.Fields>
              <Button type="button" variant="ghost" tone="strong">
                <CircleDashed
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <span>Todo</span>
              </Button>
              <Button type="button" variant="ghost" tone="strong">
                <CircleDashed
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <span>No type</span>
              </Button>
              <Button type="button" variant="ghost" tone="strong">
                <Signal
                  className="size-3.5 text-state-warning"
                  strokeWidth={1.75}
                />
                <span>Medium</span>
              </Button>
              <Button type="button" variant="ghost" tone="muted">
                <UserRound className="size-3.5" strokeWidth={1.75} />
                <span>Unassigned</span>
              </Button>
              <Button type="button" variant="ghost" tone="muted">
                <Plus className="size-3.5" strokeWidth={1.75} />
                <span>Add estimate</span>
              </Button>
              <Button type="button" variant="ghost" tone="muted">
                <Plus className="size-3.5" strokeWidth={1.75} />
                <span>Assign sprint</span>
              </Button>
            </Composer.Fields>
            <Composer.Footer>
              <Composer.Hint>Starts with an empty description</Composer.Hint>
              <Composer.Actions>
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={title.trim() === ""}>
                  Create ticket
                </Button>
              </Composer.Actions>
            </Composer.Footer>
          </Composer.Tray>
        </form>
      </div>
    </div>
  )
}
