const fs = require("node:fs");

const NIGHTLY_TAG = /^v(\d+\.\d+\.\d+)-nightly\.\d{8}\.\d+$/;
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const HOUR_MS = 60 * 60 * 1000;

const listReleases = async ({ github, context }) =>
  (await github.paginate(github.rest.repos.listReleases, { ...context.repo, per_page: 100 })).filter(
    (release) => !release.draft && release.published_at,
  );

const newestFirst = (releases) =>
  releases.toSorted((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));

const nightlies = (releases) => newestFirst(releases.filter((r) => NIGHTLY_TAG.test(r.tag_name)));
const stables = (releases) => newestFirst(releases.filter((r) => STABLE_TAG.test(r.tag_name)));

const ageHours = (release, now) => (now - Date.parse(release.published_at)) / HOUR_MS;

const nextPatch = (version) => {
  const match = STABLE_TAG.exec(`v${version.replace(/[-+].*$/, "")}`);
  if (!match) throw new Error(`package.json version '${version}' is not MAJOR.MINOR.PATCH`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
};

const packageVersion = () => JSON.parse(fs.readFileSync("package.json", "utf8")).version;

const compare = async ({ github, context }, base, head) =>
  (await github.rest.repos.compareCommitsWithBasehead({ ...context.repo, basehead: `${base}...${head}`, per_page: 1 }))
    .data.status;

const assertOnDefaultBranch = async (api, sha) => {
  const branch = api.context.payload.repository.default_branch;
  const status = await compare(api, sha, branch);
  if (status !== "ahead" && status !== "identical") {
    throw new Error(`${sha} is not on ${branch} (${status})`);
  }
};

const nightlyVersion = ({ base, date, runNumber }) => {
  const day = new Date(date).toISOString().slice(0, 10).replace(/-/g, "");
  return `${base}-nightly.${day}.${runNumber}`;
};

const skip = (core, reason) => {
  core.notice(`Skipping nightly: ${reason}`);
  core.setOutput("publish", "false");
};

async function resolveNightly({ github, context, core, gapHours, force, now = Date.now() }) {
  const api = { github, context };
  const sha = context.sha;
  const last = nightlies(await listReleases(api))[0];

  if (last && !force) {
    const age = ageHours(last, now);
    if (age < gapHours) return skip(core, `${last.tag_name} is ${age.toFixed(1)}h old, gap is ${gapHours}h`);
    const status = await compare(api, last.tag_name, sha);
    if (status !== "ahead") return skip(core, `${sha} is ${status} relative to ${last.tag_name}`);
  }

  const version = nightlyVersion({ base: nextPatch(packageVersion()), date: now, runNumber: context.runNumber });
  core.setOutput("publish", "true");
  core.setOutput("sha", sha);
  core.setOutput("short_sha", sha.slice(0, 7));
  core.setOutput("version", version);
  core.setOutput("tag", `v${version}`);
  core.setOutput("previous_tag", last?.tag_name ?? "");
}

async function resolveStable({ github, context, core, soakHours, version, ref, now = Date.now() }) {
  const api = { github, context };
  const releases = await listReleases(api);
  let sha;
  let base;

  if (ref) {
    sha = (await github.rest.repos.getCommit({ ...context.repo, ref })).data.sha;
    core.notice(`Stable release builds explicit commit ${sha}.`);
  } else {
    const candidate = nightlies(releases).find((r) => ageHours(r, now) >= soakHours);
    if (!candidate) throw new Error(`No nightly older than ${soakHours}h. Pass a ref to ship an explicit commit.`);
    sha = (await github.rest.repos.getCommit({ ...context.repo, ref: candidate.tag_name })).data.sha;
    base = NIGHTLY_TAG.exec(candidate.tag_name)[1];
    core.notice(`Stable release builds ${sha}, the commit shipped by ${candidate.tag_name}.`);
  }

  await assertOnDefaultBranch(api, sha);

  const resolved = (version || base || "").replace(/^v/, "");
  const match = STABLE_TAG.exec(`v${resolved}`);
  if (!match) throw new Error(`Stable version '${resolved}' is not MAJOR.MINOR.PATCH. Pass a version input.`);
  if (releases.some((r) => r.tag_name === `v${resolved}`)) throw new Error(`v${resolved} is already released.`);

  core.setOutput("sha", sha);
  core.setOutput("short_sha", sha.slice(0, 7));
  core.setOutput("version", resolved);
  core.setOutput("tag", `v${resolved}`);
  core.setOutput("minor_tag", `${match[1]}.${match[2]}`);
  core.setOutput("previous_tag", stables(releases)[0]?.tag_name ?? "");
}

module.exports = { resolveNightly, resolveStable, nextPatch, nightlyVersion };
