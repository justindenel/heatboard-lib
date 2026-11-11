# Heatboard

Heat-based competition brackets for board sports (windsurf, surf, kite): a framework-agnostic core that holds every rule, and React components to run an event on top of it.

- **Formats by rounds.** Build the rounds, heats and links from a few numbers (riders, heats, qualifiers), with an optional repechage, a small final and seeds that join a round directly. Formats export to and import from JSON.
- **Race format.** Scoring with categories, counted rides, and figures grouped in families with variants; presets for windsurf wave and freestyle, surf and kite freestyle. Heat timer, breaks and automatic chaining.
- **Judging.** Free mode (each judge notes alone) or head-judge mode (shared rides, ride means), with penalties, ties and live totals.
- **Standings, simulation and a public view.** Provisional and final standings, simulated rounds for demos, and a read-only spectator board.
- **Themes and languages.** Four built-in themes with light and dark schemes, custom themes through CSS variables, English and French labels.

## Packages

| Package                                    | What it is                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [`@heatboard/core`](packages/core)         | Pure functions over plain JSON data: actions, validation, scoring, formats, standings. No DOM. |
| [`@heatboard/react`](packages/react)       | React 19 components and hooks built on the core: board, judge pages, editors, themes.          |
| [`playground`](playground) (not published) | The demo site: a running event, a repechage format and a new bracket to build, in every theme. |

## Quick start

```sh
pnpm add @heatboard/react @heatboard/core react react-dom
```

```tsx
import { Board, BracketProvider, useBracket } from "@heatboard/react";
import "@heatboard/react/styles.css";
import type { Bracket } from "@heatboard/core";

function App({ initial }: { initial: Bracket }) {
	const controller = useBracket({ defaultBracket: initial });
	return (
		<BracketProvider value={controller}>
			<Board mode="admin" />
		</BracketProvider>
	);
}
```

Every change goes through `applyAction` of the core, which returns the next bracket or an error and never mutates its input. See the README of each package for the API and a theming guide.

## Try it

- Playground: <https://justindenel.github.io/heatboard-lib/>
- Hosted platform, built on these libraries (events, public pages, judging from a phone): <https://heatboard.denel.dev>

## Status

Version 0.x: the API may change between minor versions. Changes are listed in the changelog of each package.

## Development

```sh
pnpm install
pnpm build       # both packages and the playground
pnpm test
pnpm typecheck
pnpm lint
pnpm format      # or format:check
pnpm --filter @heatboard/playground dev
```

Node 24 or newer and pnpm 11 (see `packageManager` in `package.json`). Inside the workspace, packages resolve each other from `src/` through the `source` export condition, so no build is needed to run the tests or the playground. See [CONTRIBUTING.md](CONTRIBUTING.md) and [RELEASING.md](RELEASING.md).

## Licence

[MPL-2.0](LICENSE). The `LICENSE` file applies to all files in this repository.

In plain terms: you can use this library in any software, including closed-source and commercial products. If you modify files of this library, you must share those modified files under the same licence (file-level copyleft); your own code that merely uses the library stays yours.
