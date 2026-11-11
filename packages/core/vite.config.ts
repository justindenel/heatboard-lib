import {
	defaultClientConditions,
	defaultServerConditions,
	defineConfig,
} from "vite";

export default defineConfig({
	resolve: {
		conditions: ["source", ...defaultClientConditions],
	},
	ssr: {
		resolve: {
			conditions: ["source", ...defaultServerConditions],
		},
	},
	build: {
		lib: {
			entry: "src/index.ts",
			formats: ["es"],
			fileName: "index",
		},
	},
});
