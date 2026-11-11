# @heatboard/react

React components for heat-based competition brackets: a bracket view (viewer and admin), judge pages, scoring and format editors. Built on [`@heatboard/core`](https://github.com/justindenel/heatboard-lib/tree/main/packages/core), which holds all the rules.

Status: 0.x, the API may still change between minor versions.

## Install

```sh
pnpm add @heatboard/react @heatboard/core
```

Peer dependencies: `react` and `react-dom` 19. Import the stylesheet once:

```ts
import "@heatboard/react/styles.css";
```

`@heatboard/react` re-exports nothing from the core: import core functions and types from `@heatboard/core`.

## Example

```tsx
import { Board, BracketProvider, HeatCard, useBracket } from "@heatboard/react";
import "@heatboard/react/styles.css";
import type { Bracket } from "@heatboard/core";

function App({ initial }: { initial: Bracket }) {
	const controller = useBracket({ defaultBracket: initial });
	const round = controller.bracket.rounds[0]!;
	return (
		<BracketProvider
			value={controller}
			renderRiderName={(entry) => <strong>{entry.displayName}</strong>}
			classNames={{ participant: "my-participant" }}
		>
			<Board mode="admin" />
			{/* Outside a Board, a component reads the settings of the provider. */}
			<HeatCard round={round} heat={round.heats[0]!} heatIndex={0} />
		</BracketProvider>
	);
}
```

## Display settings

`mode`, `labels`, `riders`, `renderRiderName`, `getRiderLabel`, `lycraColors`, `getLycraColor`, `components`, `classNames`, `styles`, `unstyled`, `headingLevel`, `getHeatData`, `getHeatResult` and `judgeLabel` (the `PresentationProps` type) are optional props of `BracketProvider`: they are the defaults of every component below it. `Board` and the other components accept the same props to override them locally; the nearest value wins, and `labels`, `components`, `classNames` and `styles` merge key by key.

`Board` has two modes: `viewer` (read-only) and `admin` (drag and drop, editing controls, refined by `permissions`). The judge pages are not a `Board` mode: use `JudgePanel` and `HeadJudgePanel` with `useJudging` and `useHeadJudging`.

## Main exports

- Providers and hooks: `BracketProvider`, `HeatboardProvider`, `useBracket`, `useBracketContext`, `useHeat`, `useRound`, `useEntry`, `useJudging`, `useHeadJudging`, `useSchedule`, `useHeatTimer`, `useRacePause`.
- Bracket view: `Board`, `RoundColumn`, `HeatCard`, `ParticipantRow`, `EmptySlot`, `EntryPool`, `Inspector`, `HeatTimer`, `HeatPenalties`, `HeatboardDnd`.
- Judging: `JudgePanel`, `HeadJudgePanel`, `JudgeRanking`, `JudgePenalties`.
- Editors: `ScoringEditor`, `FormatEditor`, `FormatShape`, `FormatRoundsEditor`, and the plan-editing helpers used by a custom format editor (`withRiders`, `withFirstRound`, `withSmallFinal`, `withSeedSlots`, `withRepechage`, `addRound`, `removeRound`, `modifiedCount`). A host that also edits the race timing composes the pieces of `ScoringEditor` itself: `RaceFormatProvider` (one draft, one `setRaceFormat`), `RaceFormatLines`, `RaceFormatSection`, `ScoringSections`, `FiguresPanel`, `RaceFormatFooter`.
- Text helpers: `describeScoring` (pass example scorings through core's `localiseScoring` first), `describeRaceFormat`, `formatNamesOf`, `doubleNamesOf`, `errorMessage`, `heatLabel`, `slotOrigins`, `originText`.

Every internal piece can be replaced through the `components` prop with the same props as the original.

## Theming and labels

Colors, radii and fonts are CSS variables (`--hb-*`) set on the root of the board. `HeatboardProvider` takes `theme`, `colorScheme` (`light`, `dark` or `system`), `locale` (`en` or `fr`), `labels` (a shallow override of the active locale) and `lycraColors`; nested providers inherit and override.

```tsx
import { HeatboardProvider, defineTheme, themes } from "@heatboard/react";

const brand = defineTheme({
	name: "brand",
	extends: themes.lagoon,
	light: { "color-accent": "#e4007c" },
	dark: { "color-accent": "#ff4fae" },
});

<HeatboardProvider
	theme={brand}
	locale="fr"
	labels={{ heatTitle: (n) => `Manche ${n}` }}
>
	{/* ... */}
</HeatboardProvider>;
```

Built-in themes: `themes.classic`, `themes.raceBoard`, `themes.lagoon`, `themes.goldenHour`.

The themes use web fonts (Barlow, Lexend, Unbounded) that the host application loads itself; without them the components fall back to system fonts.

## TypeScript note

The drag and drop layer relies on `@dnd-kit`, whose types may need `skipLibCheck: true` in strict setups with React 19.

## Licence

[MPL-2.0](LICENSE)
