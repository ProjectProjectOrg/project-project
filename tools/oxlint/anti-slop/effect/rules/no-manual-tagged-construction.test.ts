import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";

const decodeOutput = Schema.decodeUnknownSync(Schema.Struct({
	diagnostics: Schema.Array(Schema.Struct({
		code: Schema.String,
		labels: Schema.Array(Schema.Struct({ span: Schema.Struct({ line: Schema.Int }) })),
	})),
}));

const cases = [
	{ source: 'const fixture = { _tag: "Fixture" };', warning: true },
	{ source: 'const make = () => ({ _tag: "ReturnedFixture" });', warning: true },
	{ source: 'expect(value).toEqual({ _tag: "Expected" });', warning: false },
	{ source: 'expect(value).toMatchObject({ _tag: "Failure", failure: { _tag: "DomainError" } });', warning: false },
	{ source: 'expect(value).not.toStrictEqual({ _tag: "Expected" });', warning: false },
	{ source: 'expect(value).rejects.toMatchObject({ _tag: "Expected" });', warning: false },
	{ source: 'expect.soft(value).toMatchObject({ _tag: "Expected" });', warning: false },
	{ source: 'expect.poll(() => value).toMatchObject({ _tag: "Expected" });', warning: false },
	{ source: 'expect(value).toEqual(expect.objectContaining({ _tag: "Expected" }));', warning: false },
	{ source: 'expect(value).toEqual(expect.arrayContaining([{ _tag: "Expected" }]));', warning: false },
	{ source: 'expect({ _tag: "ActualFixture" }).toEqual(value);', warning: true },
	{ source: 'expect(make({ _tag: "ActualArgument" })).toEqual(value);', warning: true },
	{ source: 'expect(value).toEqual(make({ _tag: "FactoryArgument" }));', warning: true },
	{ source: 'expect(value).toEqual(new Wrapper({ _tag: "ConstructorArgument" }));', warning: true },
	{ source: 'expect(value).toMatchObject({ make: () => ({ _tag: "CallbackFixture" }) });', warning: true },
	{ source: 'Match.when({ _tag: "Pattern" }, handle);', warning: false },
];

test("checks construction while allowing assertion patterns", () => {
	const root = fileURLToPath(new URL("../../../../../", import.meta.url));
	const directory = mkdtempSync(join(tmpdir(), "projectproject-tagged-rule-"));
	try {
		const config = join(directory, "config.json");
		const fixture = join(directory, "fixture.ts");
		writeFileSync(config, JSON.stringify({
			categories: { correctness: "off" },
			jsPlugins: [{ name: "anti-slop-effect", specifier: fileURLToPath(new URL("../index.ts", import.meta.url)) }],
			rules: { "anti-slop-effect/no-manual-tagged-construction": "warn" },
		}));
		writeFileSync(fixture, cases.map(({ source }) => source).join("\n"));
		const result = spawnSync(join(root, "node_modules/.bin/oxlint"), ["--config", config, "--format", "json", fixture], {
			cwd: root,
			encoding: "utf8",
		});
		expect(result.status, result.stderr).toBe(0);
		const output = decodeOutput(JSON.parse(result.stdout));
		expect(output.diagnostics.map(({ code }) => code)).toEqual(
			cases.filter(({ warning }) => warning).map(() => "anti-slop-effect(no-manual-tagged-construction)"),
		);
		expect(output.diagnostics.flatMap(({ labels }) => labels.map(({ span }) => span.line))).toEqual(
			cases.flatMap(({ warning }, index) => warning ? [index + 1] : []),
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
