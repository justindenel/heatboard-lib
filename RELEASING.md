# Releasing

Versions and changelogs are managed with [Changesets](https://github.com/changesets/changesets). The two packages are versioned independently: a fix in the core does not force a new React version. When the core is released, the React package gets an automatic patch bump so that its `@heatboard/core` range follows. While the version is 0.x, `^0.1.0` only matches 0.1.x, so every minor of the core is followed by a release of the React package.

## How a release works

Publishing happens only through the `release` branch, never on a push to `main`.

1. A pull request that changes a published package adds a changeset (`pnpm changeset`) and merges into `main`. CI runs on pull requests into `main` and `release`.
2. To release, a maintainer opens a pull request from `main` into `release` and merges it with a merge commit (not squash, not rebase).
3. Merging it runs the Release workflow (`.github/workflows/release.yml`) on the `release` branch, which:
   - runs the typecheck and the tests;
   - runs `changeset version` (new versions and changelog entries from the pending changesets) and pushes that commit to `release`;
   - publishes every version not yet on npm, with provenance, through npm trusted publishing (no npm token is stored), and tags it;
   - pushes the tags and creates one GitHub release per new tag, using the matching changelog section as notes;
   - opens a pull request from `release` into `main` carrying the version bump back.
4. Merge that sync pull request into `main` with a merge commit before the next release; otherwise the next `main` into `release` pull request conflicts on versions and changelogs.

If no changeset is pending, the workflow versions and publishes nothing and ends green.

## If a publish fails midway

Typically one package is published and the next one fails. Nothing is published twice:

1. Read the failed run to find the cause.
2. If the fix needs code, merge it into `main` and go through `main` into `release` again.
3. Otherwise re-run the workflow: Re-run failed jobs, or Run workflow on the `release` branch. It starts from the tip of `release` (which already holds the version commit), skips what is already on npm, publishes the rest and recreates the missing tags.
4. If only the GitHub releases step failed, create them by hand with `gh release create <tag> --notes-file <file>`.
5. A version published on npm cannot be republished: if it is broken, ship a new patch with a changeset.

## Checking a release

The Provenance badge on the npm page confirms that the build is attested. Install the published packages in an empty project and run the example from the README to check the tarballs.
