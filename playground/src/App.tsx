import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
	canSimulateRound,
	generateHeadJudgeNotes,
	generateNotes,
	scoringOf,
	simulateRound,
	type Bracket,
	type Entry,
} from "@heatboard/core";
import {
	Board,
	BracketProvider,
	EntryPool,
	HeatboardDnd,
	HeadJudgePanel,
	HeatboardProvider,
	JudgePanel,
	themes,
	useBracket,
	useHeatboardConfig,
	useHeadJudging,
	useJudging,
	type BoardSelection,
	type BracketController,
	type HeatboardTheme,
} from "@heatboard/react";
import "@heatboard/react/styles.css";
import {
	RUNNING_HEAT_ID,
	demoRiders,
	makeBracket,
	type DemoMode,
	type DemoRider,
	type DemoScenario,
} from "./demo-bracket";
import {
	DEFAULT_CONFIG,
	MODES,
	SCENARIOS,
	SCHEMES,
	clearStoredConfig,
	loadStoredConfig,
	mergeConfig,
	saveStoredConfig,
	type DemoConfig,
} from "./demo-config";
import {
	PlaygroundHeader,
	Segmented,
	type SegmentOption,
} from "./PlaygroundHeader";
import { text } from "./text";
import {
	createDemoJudgingServer,
	type DemoJudgingServer,
} from "./judging-server";

type ViewKey = DemoConfig["view"];
type ThemeKey = DemoConfig["theme"];

const JUDGES = ["judge1", "judge2", "judge3"] as const;

const GENERATION_SEED = 42;

const THEMES: Record<ThemeKey, { label: string; theme: HeatboardTheme }> = {
	classic: { label: "Classic", theme: themes.classic },
	raceBoard: { label: "Race Board", theme: themes.raceBoard },
	lagoon: { label: "Lagoon", theme: themes.lagoon },
	goldenHour: { label: "Golden Hour", theme: themes.goldenHour },
};

const LOCALE_OPTIONS: SegmentOption<DemoConfig["locale"]>[] = [
	{ value: "en", label: "EN" },
	{ value: "fr", label: "FR" },
];

const THEME_OPTIONS = (
	Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]
).map(([value, t]) => ({ value, label: t.label }));

const initialSelection = (): BoardSelection | null => {
	const params = new URLSearchParams(window.location.search);
	const heatId = params.get("heat");
	if (heatId) return { type: "heat", heatId };
	return params.get("select") === "bracket" ? { type: "bracket" } : null;
};

const renderRider = (entry: Entry, rider: DemoRider | undefined) =>
	rider ? `${entry.displayName} (${rider.sailNumber})` : entry.displayName;

export function App() {
	const [config, setConfig] = useState<DemoConfig>(() =>
		mergeConfig(
			new URLSearchParams(window.location.search),
			loadStoredConfig(),
		),
	);
	const update = <K extends keyof DemoConfig>(key: K, value: DemoConfig[K]) =>
		setConfig((current) => ({ ...current, [key]: value }));
	const t = text[config.locale];

	useEffect(() => {
		if (JSON.stringify(config) === JSON.stringify(DEFAULT_CONFIG)) {
			clearStoredConfig();
		} else {
			saveStoredConfig(config);
		}
	}, [config]);

	useEffect(() => {
		const root = document.documentElement;
		root.style.colorScheme =
			config.scheme === "system" ? "light dark" : config.scheme;
		return () => {
			root.style.removeProperty("color-scheme");
		};
	}, [config.scheme]);

	useEffect(() => {
		document.documentElement.lang = config.locale;
		document.title = t.title;
	}, [config.locale, t.title]);

	// Judge views need the running heat of the running event; the head judge only exists in head-judge mode.
	const views = viewsFor(config, t);
	const view = views.some((v) => v.value === config.view)
		? config.view
		: "admin";

	return (
		<HeatboardProvider
			locale={config.locale}
			theme={THEMES[config.theme].theme}
			colorScheme={config.scheme}
		>
			<PlaygroundHeader title={t.title}>
				<Segmented
					label={t.groups.locale}
					value={config.locale}
					options={LOCALE_OPTIONS}
					onChange={(v) => update("locale", v)}
				/>
				<Segmented
					label={t.groups.theme}
					value={config.theme}
					options={THEME_OPTIONS}
					onChange={(v) => update("theme", v)}
				/>
				<Segmented
					label={t.groups.scheme}
					value={config.scheme}
					options={SCHEMES.map((value) => ({
						value,
						label: t.schemes[value],
					}))}
					onChange={(v) => update("scheme", v)}
				/>
				<Segmented
					label={t.groups.scenario}
					value={config.scenario}
					options={SCENARIOS.map((value) => ({
						value,
						label: t.scenarios[value],
					}))}
					onChange={(v) => update("scenario", v)}
				/>
				<Segmented
					label={t.groups.mode}
					value={config.mode}
					options={MODES.map((value) => ({ value, label: t.modes[value] }))}
					onChange={(v) => update("mode", v)}
				/>
				<Segmented
					label={t.groups.view}
					value={view}
					options={views}
					onChange={(v) => update("view", v)}
				/>
			</PlaygroundHeader>
			<main className="pg-main">
				<p className="pg-hint">{t.hints[config.scenario]}</p>
				<Stage
					key={`${config.scenario}:${config.mode}`}
					view={view}
					mode={config.mode}
					scenario={config.scenario}
				/>
			</main>
		</HeatboardProvider>
	);
}

function viewsFor(
	config: DemoConfig,
	t: (typeof text)[DemoConfig["locale"]],
): SegmentOption<ViewKey>[] {
	const base: SegmentOption<ViewKey>[] = [
		{ value: "admin", label: t.views.admin },
		{ value: "viewer", label: t.views.viewer },
	];
	if (config.scenario !== "running") return base;
	return [
		...base,
		...(config.mode === "headJudge"
			? [{ value: "headJudge" as const, label: t.views.headJudge }]
			: []),
		...JUDGES.map((id, i) => ({ value: id, label: t.judge(i + 1) })),
	];
}

function Stage({
	view,
	mode,
	scenario,
}: {
	view: ViewKey;
	mode: DemoMode;
	scenario: DemoScenario;
}) {
	const [selection, setSelection] = useState<BoardSelection | null>(
		initialSelection,
	);
	const [initial] = useState(() => makeBracket(scenario, mode));
	const [bracket, setBracket] = useState(initial);
	const controller = useBracket({ bracket, onChange: setBracket });
	const [server] = useState(() => {
		const created = createDemoJudgingServer(mode);
		fillRunningHeat(initial, created, mode);
		return created;
	});
	const snapshot = useSyncExternalStore(
		server.subscribeSnapshot,
		server.getSnapshot,
	);
	const getHeatData = useCallback(
		(heatId: string) => snapshot.heatData(heatId),
		[snapshot],
	);

	return (
		<BracketProvider value={controller}>
			{view === "headJudge" ? (
				<HeadJudgeView controller={controller} server={server} />
			) : view === "judge1" || view === "judge2" || view === "judge3" ? (
				<JudgeView
					key={view}
					judgeId={view}
					controller={controller}
					server={server}
				/>
			) : view === "viewer" ? (
				<div className="layout__board">
					<Board<DemoRider>
						mode="viewer"
						selection={selection}
						onSelectionChange={setSelection}
						riders={demoRiders}
						renderRiderName={renderRider}
						getHeatData={getHeatData}
					/>
				</div>
			) : (
				<HeatboardDnd>
					<SimulateBar
						bracket={bracket}
						onSimulated={setBracket}
						server={server}
					/>
					<div className="layout">
						<EntryPool<DemoRider>
							mode="admin"
							defaultCollapsed
							roundId={bracket.rounds[0]?.id ?? "round1"}
							riders={demoRiders}
							renderRiderName={renderRider}
						/>
						<div className="layout__board">
							<Board<DemoRider>
								mode="admin"
								selection={selection}
								onSelectionChange={setSelection}
								riders={demoRiders}
								renderRiderName={renderRider}
								getHeatData={getHeatData}
							/>
						</div>
					</div>
				</HeatboardDnd>
			)}
		</BracketProvider>
	);
}

/**
 * Stands in for the host's "simulate" feature: the core plays the first round that has heats with
 * known riders, and the generated notes go to the demo server so the heat details show them.
 */
function SimulateBar({
	bracket,
	onSimulated,
	server,
}: {
	bracket: Bracket;
	onSimulated: (next: Bracket) => void;
	server: DemoJudgingServer;
}) {
	const { locale } = useHeatboardConfig();
	const t = text[locale];
	const [runs, setRuns] = useState(0);
	const round = bracket.rounds.find((r) => canSimulateRound(bracket, r.id));

	const simulate = () => {
		if (!round) return;
		const result = simulateRound(bracket, round.id, GENERATION_SEED + runs, {
			judgeIds: [...JUDGES],
		});
		if (!result.ok) return;
		for (const heat of result.heats) {
			if (heat.announcedRides) {
				server.replaceHeat(heat.heatId, {
					rides: heat.announcedRides,
					scores: Object.values(heat.byJudge).flatMap((d) => d.scores),
				});
				continue;
			}
			for (const [judgeId, notes] of Object.entries(heat.byJudge)) {
				server.replace(heat.heatId, judgeId, notes);
			}
		}
		setRuns(runs + 1);
		onSimulated(result.bracket);
	};

	return (
		<div className="pg-bar">
			<button
				type="button"
				className="pg-action"
				disabled={!round}
				onClick={simulate}
			>
				{round ? t.simulate(round.name) : t.simulateNothing}
			</button>
		</div>
	);
}

function fillRunningHeat(
	bracket: Bracket,
	server: DemoJudgingServer,
	mode: DemoMode,
) {
	const heatId = runningHeatId(bracket);
	const found = bracket.rounds
		.flatMap((r) => r.heats)
		.find((h) => h.id === heatId);
	const scoring = found ? scoringOf(bracket, found) : undefined;
	if (!scoring || !found) return;
	const options = {
		scoring,
		riderIds: found.slots
			.filter((s) => s.status === undefined)
			.map((s) => s.riderId),
		judgeIds: [...JUDGES],
		seed: GENERATION_SEED,
		startAt: found.startedAt ?? new Date().toISOString(),
	};
	if (mode === "headJudge") {
		server.replaceHeat(heatId, generateHeadJudgeNotes(options));
		return;
	}
	for (const [judgeId, notes] of Object.entries(generateNotes(options))) {
		server.replace(heatId, judgeId, notes);
	}
}

function runningHeatId(bracket: Bracket): string {
	for (const round of bracket.rounds) {
		const running = round.heats.find((h) => h.status === "running");
		if (running) return running.id;
	}
	return RUNNING_HEAT_ID;
}

function JudgeView({
	judgeId,
	controller,
	server,
}: {
	judgeId: string;
	controller: BracketController;
	server: DemoJudgingServer;
}) {
	const heatId = runningHeatId(controller.bracket);
	const judging = useJudging({
		bracket: controller.bracket,
		heatId,
		judgeId,
		server,
		syncIntervalMs: 3000,
	});
	return (
		<div className="judge-stage">
			<div className="phone">
				<div className="phone__screen">
					<JudgePanel heatId={heatId} judging={judging} />
				</div>
			</div>
		</div>
	);
}

function HeadJudgeView({
	controller,
	server,
}: {
	controller: BracketController;
	server: DemoJudgingServer;
}) {
	const heatId = runningHeatId(controller.bracket);
	const headJudging = useHeadJudging({
		bracket: controller.bracket,
		heatId,
		server,
		judgeCount: JUDGES.length,
		syncIntervalMs: 3000,
	});
	return (
		<div className="judge-stage">
			<div className="phone">
				<div className="phone__screen">
					<HeadJudgePanel heatId={heatId} headJudging={headJudging} />
				</div>
			</div>
		</div>
	);
}
