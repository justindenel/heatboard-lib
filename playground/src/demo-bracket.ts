import {
	applyAction,
	defaultPlan,
	editorFromPlan,
	formatFromPlan,
	scoringPresets,
	type Bracket,
	type HeatSlot,
	type Link,
} from "@heatboard/core";

export interface DemoRider {
	sailNumber: string;
	country: string;
}

const NAMES: readonly string[] = [
	"Alba Corvin",
	"Bram Tillery",
	"Cleo Marsh",
	"Dorian Veck",
	"Elia Norwood",
	"Fenna Ashby",
	"Gael Ostrand",
	"Hana Pellew",
	"Ivo Brannock",
	"Juno Kestrel",
	"Kaito Renfrew",
	"Lior Dunmore",
	"Mila Quarrie",
	"Nico Fairweather",
	"Odile Hargrave",
	"Pablo Whitlock",
	"Quinn Ashdown",
	"Rafa Lindqvist",
	"Sana Okoro",
];

const COUNTRIES: readonly string[] = ["FR", "ES", "IT", "PT", "DE", "GB"];

const id = (n: number) => `r${String(n).padStart(2, "0")}`;

export const demoRiders: Record<string, DemoRider> = Object.fromEntries(
	NAMES.map((_, i) => [
		id(i + 1),
		{
			sailNumber: String(100 + i * 7),
			country: COUNTRIES[i % COUNTRIES.length] ?? "FR",
		},
	]),
);

const ranked = (n: number, rank: number): HeatSlot => ({
	riderId: id(n),
	rank,
});
const waiting = (n: number): HeatSlot => ({ riderId: id(n), rank: null });
const withStatus = (n: number, status: "DNF" | "DSQ" | "DNS"): HeatSlot => ({
	riderId: id(n),
	rank: null,
	status,
});

const links: Link[] = [
	...["r1h1", "r1h2", "r1h3", "r1h4"].flatMap((heatId): Link[] => [
		{ from: { heatId, rank: 1 }, to: { heatId: "r2h1" } },
		{ from: { heatId, rank: 2 }, to: { heatId: "r2h2" } },
		{ from: { heatId, rank: 3 }, to: "eliminated" },
		{ from: { heatId, rank: 4 }, to: "eliminated" },
	]),
	...["r2h1", "r2h2"].flatMap((heatId): Link[] => [
		{ from: { heatId, rank: 1 }, to: { heatId: "r3h1" } },
		{ from: { heatId, rank: 2 }, to: { heatId: "r3h1" } },
		{ from: { heatId, rank: 3 }, to: "eliminated" },
		{ from: { heatId, rank: 4 }, to: "eliminated" },
	]),
];

export type DemoMode = "headJudge" | "free";
export type DemoScenario = "running" | "repechage" | "new";

/** Head-judge mode scores by ride means; free mode lets each judge note alone and averages the totals. */
const judgingOf = (mode: DemoMode): Pick<Bracket, "judgingMode" | "scoring"> =>
	mode === "headJudge"
		? {
				judgingMode: "headJudge",
				scoring: { ...scoringPresets.windsurfWave, method: "rideMeans" },
			}
		: { scoring: { ...scoringPresets.windsurfWave, method: "points" } };

export const RUNNING_HEAT_ID = "r2h1";
export const HEAT_DURATION_SEC = 12 * 60;

/** Windsurf wave event: round 2 heat 1 started a few minutes before `now`. */
export function makeRunningBracket(
	now: number = Date.now(),
	mode: DemoMode = "headJudge",
): Bracket {
	return {
		id: "demo-open",
		name: "Demo Open",
		status: "running",
		visibility: "public",
		timing: { heatDurationSec: HEAT_DURATION_SEC },
		...judgingOf(mode),
		entries: NAMES.map((displayName, i) =>
			i === 15
				? { riderId: id(16), displayName, seed: 1, entryRoundId: "round2" }
				: { riderId: id(i + 1), displayName },
		),
		rounds: [
			{
				id: "round1",
				name: "Round 1",
				group: "main",
				maxPerHeat: 4,
				advancing: 2,
				heats: [
					{
						id: "r1h1",
						status: "locked",
						slots: [
							ranked(1, 1),
							ranked(2, 2),
							ranked(3, 3),
							withStatus(4, "DNF"),
						],
					},
					{
						id: "r1h2",
						status: "locked",
						slots: [
							ranked(5, 1),
							ranked(6, 2),
							ranked(7, 3),
							withStatus(8, "DSQ"),
						],
					},
					{
						id: "r1h3",
						status: "judged",
						needsReview: true,
						slots: [
							ranked(9, 1),
							ranked(10, 2),
							ranked(11, 3),
							withStatus(12, "DNS"),
						],
					},
					{
						id: "r1h4",
						status: "pending",
						slots: [waiting(13), waiting(14), waiting(15)],
					},
				],
			},
			{
				id: "round2",
				name: "Round 2",
				group: "main",
				maxPerHeat: 4,
				advancing: 2,
				heats: [
					{
						id: RUNNING_HEAT_ID,
						status: "running",
						startedAt: new Date(now - 4 * 60_000).toISOString(),
						slots: [waiting(1), waiting(5), waiting(9), waiting(16)],
					},
					{
						id: "r2h2",
						status: "pending",
						slots: [waiting(2), waiting(6), waiting(10)],
					},
				],
			},
			{
				id: "round3",
				name: "Final",
				group: "main",
				maxPerHeat: 4,
				advancing: 1,
				heats: [
					{ id: "r3h1", name: "Grand final", status: "pending", slots: [] },
				],
			},
		],
		links,
	};
}

export const runningBracket: Bracket = makeRunningBracket();

const SEEDED_RIDERS = 4;

/** Sixteen riders, the first four seeded, and no round yet: the format is created in the bracket editor. */
export function makeNewBracket(mode: DemoMode = "headJudge"): Bracket {
	return {
		id: "demo-new",
		name: "Demo Open",
		status: "draft",
		visibility: "private",
		timing: { heatDurationSec: HEAT_DURATION_SEC },
		...judgingOf(mode),
		entries: NAMES.slice(0, 16).map((displayName, i) => ({
			riderId: id(i + 1),
			displayName,
			...(i < SEEDED_RIDERS && { seed: i + 1 }),
		})),
		rounds: [],
		links: [],
	};
}

/** The new bracket with a format already applied: 4 heats, 2 qualifiers each, and a repechage after round 1. */
export function makeRepechageBracket(mode: DemoMode = "headJudge"): Bracket {
	const plan = defaultPlan({
		riders: 16,
		heats: 4,
		advance: 2,
		repechage: true,
	});
	const result = applyAction(makeNewBracket(mode), {
		type: "applyFormat",
		format: formatFromPlan(plan),
		drawSeed: 7,
		editor: editorFromPlan(plan),
	});
	if (!result.ok) throw new Error(result.error.message);
	return { ...result.bracket, status: "published", visibility: "public" };
}

export function makeBracket(
	scenario: DemoScenario,
	mode: DemoMode,
	now: number = Date.now(),
): Bracket {
	if (scenario === "new") return makeNewBracket(mode);
	if (scenario === "repechage") return makeRepechageBracket(mode);
	return makeRunningBracket(now, mode);
}
