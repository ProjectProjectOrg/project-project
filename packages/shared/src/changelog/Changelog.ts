import * as Schema from "effect/Schema"

export const ChangelogChannel = Schema.Literals(["stable", "nightly"])
export type ChangelogChannel = typeof ChangelogChannel.Type

export const ChangelogSectionKind = Schema.Literals([
  "features",
  "improvements",
  "fixes"
])
export type ChangelogSectionKind = typeof ChangelogSectionKind.Type

// The product areas a change can belong to, in the order the changelog
// lists them. The page groups each list by area and labels every run of
// lines with its area, in type, never colour. `self-hosting` is for people
// who run their own instance.
export const CHANGELOG_AREAS = [
  "tickets",
  "lists",
  "sprints",
  "comments",
  "editor",
  "projects",
  "people",
  "integrations",
  "agents",
  "navigation",
  "appearance",
  "self-hosting"
] as const
export const ChangelogArea = Schema.Literals(CHANGELOG_AREAS)
export type ChangelogArea = typeof ChangelogArea.Type

// `prs` are the pull requests behind a line: usually one, more when a
// follow-up finished it, none when the line has no pull request. `area` is
// null only for lines built from pull request titles (nightlies before
// changesets existed).
export const ChangelogItem = Schema.Struct({
  text: Schema.String,
  area: Schema.NullOr(ChangelogArea),
  prs: Schema.Array(Schema.Finite)
})
export type ChangelogItem = typeof ChangelogItem.Type

export const ChangelogSection = Schema.Struct({
  kind: ChangelogSectionKind,
  items: Schema.Array(ChangelogItem)
})
export type ChangelogSection = typeof ChangelogSection.Type

// A highlight's video is a pair of files, one per theme, so it matches the
// app around it: `<name>.light.mp4` and `<name>.dark.mp4`. Changesets and
// the changelog name the pair (`<name>`); files carry the theme.
export const CHANGELOG_VIDEO_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const CHANGELOG_VIDEO_THEMES = ["light", "dark"] as const
export type ChangelogVideoTheme = (typeof CHANGELOG_VIDEO_THEMES)[number]
export const CHANGELOG_VIDEO_FILE =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:light|dark)\.mp4$/
export const changelogVideoFile = (name: string, theme: ChangelogVideoTheme) =>
  `${name}.${theme}.mp4`

// A release's headline change: its title, a short Markdown body, where to
// find it and its video. A stable release has one to three, in rank order.
export const ChangelogHighlight = Schema.Struct({
  text: Schema.String,
  body: Schema.String,
  area: Schema.NullOr(ChangelogArea),
  where: Schema.NullOr(Schema.String),
  video: Schema.NullOr(
    Schema.String.pipe(Schema.check(Schema.isPattern(CHANGELOG_VIDEO_NAME)))
  ),
  prs: Schema.Array(Schema.Finite)
})
export type ChangelogHighlight = typeof ChangelogHighlight.Type

// Something to know before updating: a breaking change, a migration, a
// security fix to act on. Title plus Markdown body.
export const ChangelogNotice = Schema.Struct({
  text: Schema.String,
  body: Schema.String,
  prs: Schema.Array(Schema.Finite)
})
export type ChangelogNotice = typeof ChangelogNotice.Type

// One release. Highlights and notices are lines too, so they are left out
// of `sections`; the counts on the page add them back.
export const ChangelogEntry = Schema.Struct({
  version: Schema.String,
  channel: ChangelogChannel,
  date: Schema.String,
  url: Schema.String,
  highlights: Schema.Array(ChangelogHighlight),
  notices: Schema.Array(ChangelogNotice),
  sections: Schema.Array(ChangelogSection)
})
export type ChangelogEntry = typeof ChangelogEntry.Type

export const Changelog = Schema.Struct({
  entries: Schema.Array(ChangelogEntry)
})
export type Changelog = typeof Changelog.Type
