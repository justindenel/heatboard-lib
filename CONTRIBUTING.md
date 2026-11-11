# Contributing

Thanks for your interest in Heatboard. Bug reports, ideas and pull requests are welcome.

## Before you start

- For a bug, open an issue with the steps to reproduce, or a failing test.
- For a feature or an API change, open an issue first so the shape can be agreed before code is written.
- Security problems go through [SECURITY.md](SECURITY.md), not a public issue.

## Setup

Requirements: Node 24 or newer, pnpm 11 (the version is pinned in `package.json`).

```sh
pnpm install
pnpm --filter @heatboard/playground dev   # demo site
pnpm test                                 # all packages
```

The workspace has two published packages (`packages/core`, `packages/react`) and a private demo (`playground`). Packages resolve each other from `src/` through the `source` export condition; the published `exports` only point to `dist/`.

## Checks

A pull request must pass what CI runs:

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check   # pnpm format fixes it
```

## Code

- TypeScript strict mode; tabs for indentation (Prettier and `.editorconfig` enforce it).
- The core stays free of runtime dependencies and of the DOM. Rules live in the core; React components only display and dispatch actions.
- New behaviour comes with a test next to the code (`__tests__/`).
- Comments are in English and explain a non-obvious why, not what the next line does.
- Do not add a dependency without discussing it in the issue first.

## Changesets

Each pull request that changes a published package adds a changeset describing the change for the changelog:

```sh
pnpm changeset
```

Pick the packages and the bump (patch, minor or major; while the version is 0.x, breaking changes are a minor). Commit the generated file in `.changeset/`. Pull requests that only touch the playground, docs or tooling need none. Maintainers publish through the `release` branch; see [RELEASING.md](RELEASING.md).

## Commits and pull requests

Keep a pull request focused on one change. Describe what changed and why, and link the issue. Squash merge is the default.

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

By contributing, you agree that your contributions are licensed under the [MPL-2.0](LICENSE).
