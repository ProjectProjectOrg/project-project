import { defineRule, type ESTree } from "@oxlint/plugins";

const SCHEMA_COMPILERS = new Set([
	"asserts", "decodeEffect", "decodeExit", "decodeOption", "decodePromise", "decodeResult", "decodeSync",
	"decodeUnknownEffect", "decodeUnknownExit", "decodeUnknownOption", "decodeUnknownPromise", "decodeUnknownResult", "decodeUnknownSync",
	"encodeEffect", "encodeExit", "encodeOption", "encodePromise", "encodeResult", "encodeSync",
	"encodeUnknownEffect", "encodeUnknownExit", "encodeUnknownOption", "encodeUnknownPromise", "encodeUnknownResult", "encodeUnknownSync", "is",
]);

const memberName = (node: ESTree.MemberExpression): string | undefined => {
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	if (node.property.type === "Literal" && typeof node.property.value === "string") return node.property.value;
	return undefined;
};

export const noInlineSchemaCompileRule = defineRule({
	meta: {
		type: "problem",
		docs: { description: "Disallow compiling Effect Schema decoders and encoders inside function bodies." },
		messages: { hoist: "Hoist Schema.{{method}}(...) to module scope so the compiled function is reused." },
	},
	createOnce(context) {
		let functionDepth = 0;
		const enterFunction = () => { functionDepth += 1; };
		const exitFunction = () => { functionDepth -= 1; };
		return {
			before() { functionDepth = 0; },
			FunctionDeclaration: enterFunction,
			"FunctionDeclaration:exit": exitFunction,
			FunctionExpression: enterFunction,
			"FunctionExpression:exit": exitFunction,
			ArrowFunctionExpression: enterFunction,
			"ArrowFunctionExpression:exit": exitFunction,
			CallExpression(node) {
				if (functionDepth === 0 || node.parent?.type !== "CallExpression" || node.parent.callee !== node) return;
				if (node.callee.type !== "MemberExpression" || node.callee.object.type !== "Identifier" || node.callee.object.name !== "Schema") return;
				const method = memberName(node.callee);
				if (method === undefined || !SCHEMA_COMPILERS.has(method)) return;
				context.report({ node: node.callee, messageId: "hoist", data: { method } });
			},
		};
	},
});
