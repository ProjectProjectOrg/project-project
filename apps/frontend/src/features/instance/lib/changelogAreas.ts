import type { ChangelogArea, ChangelogSectionKind } from "@pp/shared"
import {
  Bot,
  Compass,
  FolderKanban,
  GitPullRequest,
  MessageSquare,
  Palette,
  Pilcrow,
  Plug,
  Rows3,
  Server,
  SquareCheck,
  Timer,
  Users
} from "@pp/ui/icons"

import { m } from "@/paraglide/messages"

type AreaIcon = typeof SquareCheck

export const AREA_ICONS: Readonly<Record<ChangelogArea, AreaIcon>> = {
  tickets: SquareCheck,
  lists: Rows3,
  sprints: Timer,
  comments: MessageSquare,
  editor: Pilcrow,
  projects: FolderKanban,
  people: Users,
  integrations: Plug,
  agents: Bot,
  navigation: Compass,
  appearance: Palette,
  "self-hosting": Server
}

export const OTHER_AREA_ICON: AreaIcon = GitPullRequest

export const areaLabel = (area: ChangelogArea) =>
  ({
    tickets: m.profile_changelog_area_tickets,
    lists: m.profile_changelog_area_lists,
    sprints: m.profile_changelog_area_sprints,
    comments: m.profile_changelog_area_comments,
    editor: m.profile_changelog_area_editor,
    projects: m.profile_changelog_area_projects,
    people: m.profile_changelog_area_people,
    integrations: m.profile_changelog_area_integrations,
    agents: m.profile_changelog_area_agents,
    navigation: m.profile_changelog_area_navigation,
    appearance: m.profile_changelog_area_appearance,
    "self-hosting": m.profile_changelog_area_self_hosting
  })[area]()

export const sectionTitle = (kind: ChangelogSectionKind) =>
  ({
    features: m.chrome_whats_new_section_features,
    improvements: m.chrome_whats_new_section_improvements,
    fixes: m.chrome_whats_new_section_fixes
  })[kind]()
