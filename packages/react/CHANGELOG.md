# @heatboard/react

## 0.2.0

### Minor Changes

- 1407184: Drag and drop leaves the placement rules to the core.
  
  - Dropping a rider of a heat onto a heat of a later round now emits `advance` instead of `place`; the drop shows as a copy only when the core accepts it and the rider stays in its source heat.
  - Breaking: the `OTHER_POOL_ROUND` refusal and its label are gone. Drops between lists and heats are accepted or refused by the core, and a removal is offered whichever list is hovered.
  - The riders of a judged or locked heat can be dragged to a later round in manual advancement.
  - Manual advancement shows no "comes from / goes to" routes, and the warning when starting a heat counts the riders the core still awaits.
  - New labels for the new core error codes, in English and French.
  - Breaking: there is a single entrants panel for the bracket, listing the riders placed in no heat; the panels of later rounds are gone, and `EntryForm` no longer takes an `entryRoundId` (the `EntryFormProps` type is removed). `EntryPool`'s `roundId` only tells which round a rider dropped on the pool is taken out of.
  - Breaking: the labels `BEFORE_ENTRY_ROUND`, `ROUND_REFERENCED`, `formatEntryRoundMissing` and `entryPoolDropHere` are removed.

### Patch Changes

- Updated dependencies [1407184]
  - @heatboard/core@0.2.0

## 0.1.1

### Patch Changes

- 44e32d6: Depends on `@heatboard/core` 0.1.1: the scoring examples imported in French now have French category names.
- Updated dependencies [d1cdc5e]
  - @heatboard/core@0.1.1

## 0.1.0 — Initial release

- Bracket board for viewers and admins, with drag and drop and replaceable components.
- Judge pages for free and head-judge modes, with ranking and penalties.
- Scoring, race format and bracket format editors.
- Four built-in themes with light and dark schemes, custom themes, English and French labels.
- Hooks for the bracket, judging, scheduling and heat timer.
