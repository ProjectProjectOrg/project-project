import { eslintCompatPlugin } from "@oxlint/plugins";

import { noManualEffectErrorTagRule } from "./rules/no-manual-effect-error-tag.ts";
import { noManualEffectRuntimeInTestsRule } from "./rules/no-manual-effect-runtime-in-tests.ts";
import { noManualTagComparisonRule } from "./rules/no-manual-tag-comparison.ts";
import { noManualTaggedConstructionRule } from "./rules/no-manual-tagged-construction.ts";
import { noGlobalProcessRuntimeRule } from "./rules/no-global-process-runtime.ts";
import { noInlineSchemaCompileRule } from "./rules/no-inline-schema-compile.ts";
import { noServiceConstructorImportsRule } from "./rules/no-service-constructor-imports.ts";
import { preferEffectMatchRule } from "./rules/prefer-effect-match.ts";

/** Opt-in Oxlint rules for Effect service and Layer architecture. */
const antiSlopEffectPlugin = eslintCompatPlugin({
	meta: { name: "anti-slop-effect" },
	rules: {
		"no-global-process-runtime": noGlobalProcessRuntimeRule,
		"no-inline-schema-compile": noInlineSchemaCompileRule,
		"no-manual-effect-error-tag": noManualEffectErrorTagRule,
		"no-manual-effect-runtime-in-tests": noManualEffectRuntimeInTestsRule,
		"no-manual-tag-comparison": noManualTagComparisonRule,
		"no-manual-tagged-construction": noManualTaggedConstructionRule,
		"no-service-constructor-imports": noServiceConstructorImportsRule,
		"prefer-effect-match": preferEffectMatchRule,
	},
});

export default antiSlopEffectPlugin;
