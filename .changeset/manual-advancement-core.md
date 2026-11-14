---
"@heatboard/core": minor
---

Manual advancement, cross-round placement and direct-entry limits.

- New actions `setAdvancement`, `advance`, `placeAll` and `placeRest`, new query `placeAllPlan`, and new error codes `ADVANCEMENT_LOCKED`, `NOT_LATER_ROUND`, `SOURCE_HEAT_RUNNING`, `PLACEMENT_LOCKED`, `SEED_SLOTS_FULL` and `RIDER_ALREADY_PLACED`. Code that switches exhaustively on `Action` or on error codes must handle them.
- New `Bracket.advancement` field, queries `advancementOf`, `hasStarted` and `awaitedRiders`, and the `lockPlacementOnceStarted` option.
- Breaking: `placeQualifiers` no longer refuses a judgment when the target heat is full. The heat grows by one seat and is flagged for review.
- Breaking: in automatic advancement a manual placement cannot take the seat of an awaited qualifier.
- Breaking: a rider can move to a heat of another round before the bracket starts, or in manual advancement, instead of being refused with `CROSS_ROUND_MOVE`.
- Breaking: `SEED_SLOTS_FULL` now refuses `place` and `move` into a later round beyond the `seedSlots` of the stored format.
- Breaking: `placeQualifiers` flags the target heat for review when a qualifier is already in another heat of the target round, or when the target can no longer be edited (started, judged or locked), and no longer refuses the judgment.
- Breaking: `place` refuses, with `RIDER_ALREADY_PLACED`, a rider already placed in a heat of an earlier round that has not run yet (`SOURCE_HEAT_RUNNING` when that heat is running). The rider must be moved instead; a copy from a judged or locked heat is still accepted.
- `awaitedRiders` counts per feeder heat: riders who entered directly, or came from a heat that does not feed the target, no longer reduce what the target awaits.
- `placeAll` and `placeAllPlan` now handle a bracket without a stored format (the first round is drawn), and the draw puts back in the first round the riders placed by hand in a later round, except those whose entry round is that later round.
