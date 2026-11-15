---
"@heatboard/react": minor
---

Drag and drop leaves the placement rules to the core.

- Dropping a rider of a heat onto a heat of a later round now emits `advance` instead of `place`; the drop shows as a copy only when the core accepts it and the rider stays in its source heat.
- Breaking: the `OTHER_POOL_ROUND` refusal and its label are gone. Drops between lists and heats are accepted or refused by the core, and a removal is offered whichever list is hovered.
- The riders of a judged or locked heat can be dragged to a later round in manual advancement.
- Manual advancement shows no "comes from / goes to" routes, and the warning when starting a heat counts the riders the core still awaits.
- New labels for the new core error codes, in English and French.
- Breaking: there is a single entrants panel for the bracket, listing the riders placed in no heat; the panels of later rounds are gone, and `EntryForm` no longer takes an `entryRoundId` (the `EntryFormProps` type is removed). `EntryPool`'s `roundId` only tells which round a rider dropped on the pool is taken out of.
- Breaking: the labels `BEFORE_ENTRY_ROUND`, `ROUND_REFERENCED`, `formatEntryRoundMissing` and `entryPoolDropHere` are removed.
