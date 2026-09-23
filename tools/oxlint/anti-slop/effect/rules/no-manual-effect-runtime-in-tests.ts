import { defineRule, type ESTree } from "@oxlint/plugins";

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const EFFECT_RUNNERS = new Set([
	"runCallback", "runCallbackWith", "runFork", "runForkWith",
	"runPromise", "runPromiseExit", "runPromiseExitWith", "runPromiseWith",
	"runSync", "runSyncExit", "runSyncExitWith", "runSyncWith",
]);

const memberName = (node: ESTree.MemberExpression): string | undefined => {
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	if (node.property.type === "Literal" && typeof node.property.value === "string") return node.property.value;
	return undefined;
};

export const noManualEffectRuntimeInTestsRule = defineRule({
	meta: {
		type: "problem",
		docs: { description: "Disallow manually creating or running Effect runtimes in tests; use @effect/vitest." },
		messages: { manualRuntime: "Do not use {{runner}} in tests. Use @effect/vitest with it.effect(...) and test layers instead." },
	},
	create(context) {
		if (!TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return {};
		return {
			CallExpression(node) {
				if (node.callee.type !== "MemberExpression" || node.callee.object.type !== "Identifier") return;
				const method = memberName(node.callee);
				const object = node.callee.object.name;
				const isEffectRunner = object === "Effect" && method !== undefined && EFFECT_RUNNERS.has(method);
				const isManagedRuntime = object === "ManagedRuntime" && method === "make";
				if (!isEffectRunner && !isManagedRuntime) return;
				context.report({ node: node.callee, messageId: "manualRuntime", data: { runner: `${object}.${method}` } });
			},
		};
	},
});
