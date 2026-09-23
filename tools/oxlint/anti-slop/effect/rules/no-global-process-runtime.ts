import { defineRule, type ESTree } from "@oxlint/plugins";

const RUNTIME_PROPERTIES = new Set(["arch", "platform"]);
const OS_MODULES = new Set(["node:os", "os"]);

const memberName = (node: ESTree.MemberExpression): string | undefined => {
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	if (node.property.type === "Literal" && typeof node.property.value === "string") return node.property.value;
	return undefined;
};

const isGlobalProcess = (node: ESTree.Expression): boolean =>
	node.type === "Identifier" ? node.name === "process" : node.type === "MemberExpression" && node.object.type === "Identifier" && node.object.name === "globalThis" && memberName(node) === "process";

export const noGlobalProcessRuntimeRule = defineRule({
	meta: {
		type: "problem",
		docs: { description: "Disallow direct host platform and architecture reads; inject runtime information instead." },
		messages: { inject: "Inject the host {{property}} through an Effect service instead of reading it globally." },
	},
	createOnce(context) {
		const osNamespaces = new Set<string>();
		const osFunctions = new Map<string, string>();
		return {
			before() { osNamespaces.clear(); osFunctions.clear(); },
			ImportDeclaration(node) {
				if (!OS_MODULES.has(node.source.value)) return;
				for (const specifier of node.specifiers) {
					if (specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier") {
						osNamespaces.add(specifier.local.name);
						continue;
					}
					if (specifier.type !== "ImportSpecifier") continue;
					const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
					if (RUNTIME_PROPERTIES.has(imported)) osFunctions.set(specifier.local.name, imported);
				}
			},
			MemberExpression(node) {
				const property = memberName(node);
				if (property === undefined || !RUNTIME_PROPERTIES.has(property) || !isGlobalProcess(node.object)) return;
				context.report({ node, messageId: "inject", data: { property } });
			},
			CallExpression(node) {
				let property: string | undefined;
				if (node.callee.type === "Identifier") property = osFunctions.get(node.callee.name);
				else if (node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && osNamespaces.has(node.callee.object.name)) property = memberName(node.callee);
				if (property === undefined || !RUNTIME_PROPERTIES.has(property)) return;
				context.report({ node, messageId: "inject", data: { property } });
			},
		};
	},
});
