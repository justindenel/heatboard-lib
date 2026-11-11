import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const reactFiles = ["packages/react/**/*.{ts,tsx}", "playground/**/*.{ts,tsx}"];

export default tseslint.config(
	{
		ignores: ["**/dist", "**/coverage", "**/node_modules"],
	},
	js.configs.recommended,
	tseslint.configs.recommendedTypeChecked,
	{
		languageOptions: {
			globals: { ...globals.node },
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-misused-promises": "error",
			"@typescript-eslint/switch-exhaustiveness-check": "error",
		},
	},
	{
		files: reactFiles,
		languageOptions: { globals: { ...globals.browser } },
		extends: [reactHooks.configs.flat.recommended],
	},
	{
		files: ["playground/**/*.tsx"],
		extends: [reactRefresh.configs.vite],
	},
	{
		files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/vite.config.ts"],
		extends: [tseslint.configs.disableTypeChecked],
	},
	prettier,
);
