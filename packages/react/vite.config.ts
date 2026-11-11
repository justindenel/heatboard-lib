/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import {
	defaultClientConditions,
	defaultServerConditions,
	defineConfig,
	type Plugin,
} from "vite";

const emitStylesheet: Plugin = {
	name: "emit-stylesheet",
	generateBundle() {
		this.emitFile({
			type: "asset",
			fileName: "styles.css",
			source: readFileSync(new URL("src/styles.css", import.meta.url), "utf8"),
		});
	},
};

export default defineConfig({
	plugins: [emitStylesheet],
	test: {
		environment: "jsdom",
		css: { include: [/styles\.css/] },
	},
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
		rollupOptions: {
			external: [
				/^react($|\/)/,
				/^react-dom($|\/)/,
				/^@dnd-kit\//,
				"@heatboard/core",
			],
		},
	},
});
