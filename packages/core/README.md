# @heatboard/core

Framework-agnostic logic for heat-based competition brackets: formats, advancement between rounds, judging, scoring and standings. Pure functions over plain JSON data, no runtime dependencies, no DOM.

Status: 0.x, the API may still change between minor versions.

## Install

```sh
pnpm add @heatboard/core
```

## Example

A bracket is a plain object; every change goes through `applyAction`, which returns the next bracket or an error and never mutates its input.

```ts
import {
	applyAction,
	findHeat,
	formatPresets,
	getQualified,
	heatNumbers,
	type Bracket,
} from "@heatboard/core";

const bracket: Bracket = {
	id: "open",
	name: "Open",
	entries: Array.from({ length: 16 }, (_, i) => ({
		riderId: `r${i + 1}`,
		displayName: `Rider ${i + 1}`,
	})),
	rounds: [],
	links: [],
	status: "published",
	visibility: "private",
};

// Build the rounds, heats and links from a format and draw round 1.
const built = applyAction(bracket, {
	type: "applyFormat",
	format: formatPresets[0]!,
	drawSeed: 1,
});
if (!built.ok) throw new Error(built.error.code);

// Start the first heat, then query the result.
const first = built.bracket.rounds[0]!.heats[0]!;
const started = applyAction(built.bracket, {
	type: "setHeatStatus",
	heatId: first.id,
	status: "running",
});
if (started.ok) {
	findHeat(started.bracket, first.id)?.heat.status; // "running"
	heatNumbers(started.bracket)[first.id]; // 1
	getQualified(started.bracket, first.id); // [] until ranks are set
}
```

## Main exports

- Actions: `applyAction`, `Action`, `ActionResult`, `BracketError`; `validateBracket`.
- Queries: `findHeat`, `numberedHeats`, `heatNumbers`, `getQualified`, `getRiderPath`, `provisionalOrder`, `scoringOf`, `raceFormatOf`, `heatClock`, `schedule`; round and status queries `roundState`, `roundProgress`, `hasRunningHeat`, `defaultOpenRoundId`, `pickLiveHeat`, `pickNextHeat`.
- Scoring: `computeHeatResult`, `rankingFromResult`, `scoreNeeded`, `alignRides`, `scoringPresets`, `validateScoring`, `validateRides`.
- Results for display: `viewerHeatResult`, `computeStandings`.
- Formats and templates: `parseFormat`, `buildFromFormat`, `exportFormat`, `formatPresets`, `bracketTemplates`, `templatePlan`, and the plan helpers (`defaultPlan`, `planFromFormat`, `formatFromPlan`, `planProblems`, `refillPlan`, ...).

## Demo and test helpers

`generateNotes` and `generateHeadJudgeNotes` produce plausible random notes for a heat. They exist for demos and tests (the simulated rounds use them), not for real events.

## Labels

The core carries no text: error codes (`BracketError.code`) and display data are language-neutral. `@heatboard/react` maps them to translated labels.

## Licence

[MPL-2.0](LICENSE)
