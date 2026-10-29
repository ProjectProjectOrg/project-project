const NIGHTLY_TAG = /^v(\d{4}\.\d{2}\.\d{2})-nightly\.\d+$/
const STABLE_TAG = /^v(\d{4}\.\d{2}\.\d{2})(?:\.(\d+))?$/
const HOUR_MS = 60 * 60 * 1000

const listReleases = async ({ github, context }) =>
  (
    await github.paginate(github.rest.repos.listReleases, {
      ...context.repo,
      per_page: 100
    })
  ).filter((release) => !release.draft && release.published_at)

const newestFirst = (releases) =>
  releases.toSorted(
    (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)
  )

const nightlies = (releases) =>
  newestFirst(releases.filter((r) => NIGHTLY_TAG.test(r.tag_name)))
const stables = (releases) =>
  newestFirst(releases.filter((r) => STABLE_TAG.test(r.tag_name)))

const ageHours = (release, now) =>
  (now - Date.parse(release.published_at)) / HOUR_MS

const calendarDay = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" })
    .format(new Date(date))
    .replaceAll("-", ".")

const versionParts = (tag) => {
  const [, day, sequence] = STABLE_TAG.exec(tag)
  return [...day.split(".").map(Number), Number(sequence ?? 1)]
}

const isNewerTag = (candidate, current) => {
  const [a, b] = [versionParts(candidate), versionParts(current)]
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

const stableVersionForDay = (day, releases) => {
  const taken = releases
    .map((r) => STABLE_TAG.exec(r.tag_name))
    .filter((match) => match && match[1] === day)
    .map((match) => Number(match[2] ?? 1))
  return taken.length === 0 ? day : `${day}.${Math.max(...taken) + 1}`
}

const compare = async ({ github, context }, base, head) =>
  (
    await github.rest.repos.compareCommitsWithBasehead({
      ...context.repo,
      basehead: `${base}...${head}`,
      per_page: 1
    })
  ).data.status

const getCommit = async ({ github, context }, ref) =>
  (await github.rest.repos.getCommit({ ...context.repo, ref })).data

const assertOnDefaultBranch = async (api, sha) => {
  const branch = api.context.payload.repository.default_branch
  const status = await compare(api, sha, branch)
  if (status !== "ahead" && status !== "identical") {
    throw new Error(`${sha} is not on ${branch} (${status})`)
  }
}

const skip = (core, reason) => {
  core.notice(`Skipping nightly: ${reason}`)
  core.setOutput("publish", "false")
}

async function resolveNightly({
  github,
  context,
  core,
  gapHours,
  force,
  now = Date.now()
}) {
  const api = { github, context }
  const sha = context.sha
  const last = nightlies(await listReleases(api))[0]

  if (last && !force) {
    const age = ageHours(last, now)
    if (age < gapHours)
      return skip(
        core,
        `${last.tag_name} is ${age.toFixed(1)}h old, gap is ${gapHours}h`
      )
    const status = await compare(api, last.tag_name, sha)
    if (status !== "ahead")
      return skip(core, `${sha} is ${status} relative to ${last.tag_name}`)
  }

  const version = `${calendarDay(now)}-nightly.${context.runNumber}`
  core.setOutput("publish", "true")
  core.setOutput("sha", sha)
  core.setOutput("short_sha", sha.slice(0, 7))
  core.setOutput("version", version)
  core.setOutput("tag", `v${version}`)
  core.setOutput("previous_tag", last?.tag_name ?? "")
}

async function resolveStable({
  github,
  context,
  core,
  soakHours,
  ref,
  now = Date.now()
}) {
  const api = { github, context }
  const releases = await listReleases(api)
  const previous = stables(releases)[0]
  let sha
  let day
  let sourceTag

  if (ref) {
    const commit = await getCommit(api, ref)
    sha = commit.sha
    day = calendarDay(commit.commit.committer.date)
    sourceTag = `sha-${sha.slice(0, 7)}`
    core.notice(`Stable release ships explicit commit ${sha}.`)
  } else {
    const candidate = nightlies(releases).find(
      (r) => ageHours(r, now) >= soakHours
    )
    if (!candidate)
      throw new Error(
        `No nightly older than ${soakHours}h. Pass a ref to ship an explicit commit.`
      )
    sha = (await getCommit(api, candidate.tag_name)).sha
    if (previous && (await compare(api, previous.tag_name, sha)) !== "ahead") {
      throw new Error(
        `${candidate.tag_name} is not ahead of ${previous.tag_name}. Nothing newer to release.`
      )
    }
    day = NIGHTLY_TAG.exec(candidate.tag_name)[1]
    sourceTag = candidate.tag_name
    core.notice(
      `Stable release ships ${sha}, the commit published as ${candidate.tag_name}.`
    )
  }

  await assertOnDefaultBranch(api, sha)

  const version = stableVersionForDay(day, releases)
  if (previous && !isNewerTag(`v${version}`, previous.tag_name)) {
    throw new Error(
      `v${version} would sort before ${previous.tag_name}. Release a newer commit.`
    )
  }

  core.setOutput("sha", sha)
  core.setOutput("short_sha", sha.slice(0, 7))
  core.setOutput("version", version)
  core.setOutput("tag", `v${version}`)
  core.setOutput("source_tag", sourceTag)
  core.setOutput("previous_tag", previous?.tag_name ?? "")
}

module.exports = { resolveNightly, resolveStable }
