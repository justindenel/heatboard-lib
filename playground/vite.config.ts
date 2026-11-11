import react from "@vitejs/plugin-react";
import {
	defaultClientConditions,
	defaultServerConditions,
	defineConfig,
} from "vite";

export default defineConfig({
	// Set BASE_PATH to the sub-path the static site is served from, e.g. /heatboard-lib/ on GitHub Pages.
	base: process.env.BASE_PATH ?? "/",
	plugins: [react()],
	build: {
		// Keep light-dark() as written: lowering it would tie the page to the system scheme and ignore the Display switch.
		cssTarget: ["chrome123", "firefox120", "safari17.5"],
	},
	resolve: {
		conditions: ["source", ...defaultClientConditions],
	},
	ssr: {
		resolve: {
			conditions: ["source", ...defaultServerConditions],
		},
	},
});
