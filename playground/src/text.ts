import type { DemoConfig } from "./demo-config";

type Locale = DemoConfig["locale"];

interface PlaygroundText {
	title: string;
	groups: {
		locale: string;
		theme: string;
		scheme: string;
		mode: string;
		scenario: string;
		view: string;
	};
	schemes: Record<DemoConfig["scheme"], string>;
	modes: Record<DemoConfig["mode"], string>;
	scenarios: Record<DemoConfig["scenario"], string>;
	views: Record<"admin" | "viewer" | "headJudge", string>;
	judge: (n: number) => string;
	simulate: (roundName: string) => string;
	simulateNothing: string;
	hints: Record<DemoConfig["scenario"], string>;
}

export const text: Record<Locale, PlaygroundText> = {
	en: {
		title: "Heatboard playground",
		groups: {
			locale: "Language",
			theme: "Theme",
			scheme: "Display",
			mode: "Judging",
			scenario: "Event",
			view: "View",
		},
		schemes: { system: "System", light: "Light", dark: "Dark" },
		modes: {
			headJudge: "Head judge: shared rides",
			free: "Independent judges",
		},
		scenarios: {
			running: "Running event",
			repechage: "Repechage format",
			new: "New bracket",
		},
		views: { admin: "Admin", viewer: "Public", headJudge: "Head judge" },
		judge: (n) => `Judge ${n}`,
		simulate: (roundName) => `Simulate ${roundName}`,
		simulateNothing: "Nothing left to simulate",
		hints: {
			running:
				"Round 2 heat 1 is running. Open the judge views to note rides, or select a heat to inspect it.",
			repechage:
				"Four heats, two qualifiers each, a repechage after round 1 and seeds spread by serpentine. Open the bracket settings to change the format, then simulate the rounds.",
			new: "Sixteen riders, four seeded, no round yet. Open the bracket settings and build the rounds, with or without a repechage.",
		},
	},
	fr: {
		title: "Heatboard playground",
		groups: {
			locale: "Langue",
			theme: "Thème",
			scheme: "Affichage",
			mode: "Jugement",
			scenario: "Événement",
			view: "Vue",
		},
		schemes: { system: "Système", light: "Clair", dark: "Sombre" },
		modes: {
			headJudge: "Chef-juge : vagues partagées",
			free: "Juges indépendants",
		},
		scenarios: {
			running: "Événement en cours",
			repechage: "Format avec repêchage",
			new: "Nouveau tableau",
		},
		views: { admin: "Admin", viewer: "Public", headJudge: "Chef-juge" },
		judge: (n) => `Juge ${n}`,
		simulate: (roundName) => `Simuler ${roundName}`,
		simulateNothing: "Plus rien à simuler",
		hints: {
			running:
				"La manche 1 du tour 2 est en cours. Ouvrez les vues juge pour noter des vagues, ou sélectionnez une manche pour l'inspecter.",
			repechage:
				"Quatre manches, deux qualifiés chacune, un repêchage après le tour 1 et des têtes de série réparties en serpentin. Ouvrez les réglages du tableau pour changer le format, puis simulez les tours.",
			new: "Seize riders dont quatre têtes de série, aucun tour. Ouvrez les réglages du tableau et construisez les tours, avec ou sans repêchage.",
		},
	},
};
