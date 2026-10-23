import { defineRule, type ESTree } from "@oxlint/plugins";

import {
	isMatchPatternObject,
	isStringLiteral,
	propertyName,
} from "../shared/tagged-values.ts";

const assertionMatchers = new Set([
	"toEqual", "toStrictEqual", "toMatchObject", "toContainEqual", "toHaveProperty",
	"toHaveBeenCalledWith", "toHaveBeenLastCalledWith", "toHaveBeenNthCalledWith",
]);

const isAssertionExpectation = (node: ESTree.ObjectExpression): boolean => {
	let current: ESTree.Node = node;
	while (current.parent) {
		const parent: ESTree.Node = current.parent;
		if (parent.type === "CallExpression" && parent.arguments.some((argument) => argument === current)) {
			const callee = parent.callee;
			if (callee.type !== "MemberExpression" || callee.computed || callee.property.type !== "Identifier") return false;
			if (callee.object.type === "Identifier" && callee.object.name === "expect" &&
				(callee.property.name === "objectContaining" || callee.property.name === "arrayContaining")) return true;
			if (!assertionMatchers.has(callee.property.name)) return false;
			let receiver = callee.object;
			while (receiver.type === "MemberExpression") receiver = receiver.object;
			if (receiver.type !== "CallExpression") return false;
			const expect = receiver.callee;
			return (expect.type === "Identifier" && expect.name === "expect") ||
				(expect.type === "MemberExpression" && expect.object.type === "Identifier" && expect.object.name === "expect" &&
					!expect.computed && expect.property.type === "Identifier" && (expect.property.name === "soft" || expect.property.name === "poll"));
		}
		if (parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ArrowFunctionExpression" || parent.type === "NewExpression") return false;
		current = parent;
	}
	return false;
};

export const noManualTaggedConstructionRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Construct tagged values with their existing Effect constructor instead of writing `_tag` manually.",
		},
		messages: {
			manualConstruction:
				"Use the existing Schema tagged `.make`, tagged class/error constructor, or Data.taggedEnum variant constructor instead of writing a literal `_tag` object.",
		},
	},
	createOnce(context) {
		return {
			ObjectExpression(node) {
				if (isMatchPatternObject(node) || isAssertionExpectation(node)) return;
				const tag = node.properties.find(
					(property) =>
						property.type === "Property" &&
						propertyName(property) === "_tag" &&
						isStringLiteral(property.value),
				);
				if (tag !== undefined) {
					context.report({ node: tag, messageId: "manualConstruction" });
				}
			},
		};
	},
});
